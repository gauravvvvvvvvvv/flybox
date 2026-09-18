from __future__ import annotations

import asyncio
from collections import deque
from copy import deepcopy
import json
import math
import os
import time
import uuid

from .fly import FlyAgent
from .world import World


class SimulationEngine:
    def __init__(self, seed: int = 64):
        self.seed = seed
        self.world = World(seed=seed)
        self.world.add("food", 0.78, 0.28, radius=0.025)
        self.world.add("stimulus", 0.20, 0.72, intensity=0.9, radius=0.035)
        self.flies: dict[str, FlyAgent] = {}
        self.max_flies = int(os.getenv("FLYLAB_MAX_FLIES", "4"))
        self.running = False
        self.speed = 1.0
        self.t = 0.0
        self.events = deque(maxlen=1200)
        self._lock = asyncio.Lock()
        self._last_frames: dict[str, dict] = {}
        self._started_at = time.time()
        self.active_clients = 0
        self._create_prime()

    @property
    def dt(self) -> float:
        return next(iter(self.flies.values())).dt

    @property
    def mock(self) -> bool:
        return any(fly.mock for fly in self.flies.values())

    def _event(self, message: str, kind: str = "info", data: dict | None = None):
        self.events.append({
            "t": round(self.t, 3),
            "kind": kind,
            "message": message,
            "data": data or {},
        })

    def _create_prime(self):
        prime = FlyAgent("prime", "PRIME", self.seed, 0.50, 0.50, is_prime=True)
        self.flies[prime.id] = prime
        self._event("PRIME initialized", "system")

    async def step_once(self) -> dict:
        async with self._lock:
            frames = []
            for fly in self.flies.values():
                frames.append(fly.step(self.world, self.t))
            self.t += self.dt
            self._last_frames = {frame["id"]: frame for frame in frames}
            return self.frame_payload()

    def frame_payload(self) -> dict:
        frames = list(self._last_frames.values())
        if not frames:
            frames = [{
                "id": fly.id,
                "name": fly.name,
                "is_prime": fly.is_prime,
                "x": fly.x,
                "y": fly.y,
                "heading": fly.heading,
                "speed": fly.velocity,
                "energy": fly.energy,
                "fired_count": 0,
                "firing_fraction": 0.0,
                "newly_firing": 0,
                "firing_jaccard_distance": 0.0,
                "dn_activity": 0.0,
                "dn_fired": 0,
                "sensory_targets": 0,
                "sampled_fired": [],
                "interventions": [],
            } for fly in self.flies.values()]
        return {
            "type": "frame",
            "t": round(self.t, 3),
            "running": self.running,
            "speed": self.speed,
            "mock": self.mock,
            "flies": frames,
            "world": self.world.to_dict(),
            "events": list(self.events)[-30:],
        }

    async def reset(self):
        async with self._lock:
            self.running = False
            self.t = 0.0
            self.world = World(seed=self.seed)
            self.world.add("food", 0.78, 0.28, radius=0.025)
            self.world.add("stimulus", 0.20, 0.72, intensity=0.9, radius=0.035)
            self.flies = {}
            self._last_frames = {}
            self.events.clear()
            self._create_prime()

    async def add_fly(self, clone_prime: bool = False) -> dict:
        async with self._lock:
            if len(self.flies) >= self.max_flies:
                raise ValueError(f"resource limit: maximum {self.max_flies} full FlyBrain instances")
            fly_id = f"fly-{uuid.uuid4().hex[:5]}"
            index = len(self.flies)
            seed = self.seed + index
            fly = FlyAgent(fly_id, f"FLY {index + 1}", seed, 0.45 + index * 0.035, 0.55)
            if clone_prime:
                prime = self.flies["prime"]
                fly.x, fly.y, fly.heading = prime.x, prime.y, prime.heading
                fly.sensory_gain = prime.sensory_gain
                # Exact graph/state copying can be unsafe across CPU/CUDA. We intentionally
                # create a new seeded brain and copy observable agent configuration only.
            self.flies[fly_id] = fly
            self._event(f"{fly.name} spawned" + (" from PRIME configuration" if clone_prime else ""), "system")
            return {"id": fly.id, "name": fly.name}

    async def remove_fly(self, fly_id: str):
        async with self._lock:
            if fly_id == "prime":
                raise ValueError("PRIME cannot be removed")
            if fly_id in self.flies:
                name = self.flies[fly_id].name
                del self.flies[fly_id]
                self._last_frames.pop(fly_id, None)
                self._event(f"{name} removed", "system")

    async def add_world_object(self, payload: dict) -> dict:
        async with self._lock:
            obj = self.world.add(
                payload["kind"],
                payload["x"],
                payload["y"],
                payload.get("intensity", 0.8),
                payload.get("radius", 0.04),
            )
            self._event(f"{obj.kind} added", "world", {"id": obj.id, "x": obj.x, "y": obj.y})
            return vars(obj)

    async def remove_world_object(self, object_id: str):
        async with self._lock:
            self.world.remove(object_id)
            self._event("world object removed", "world", {"id": object_id})

    async def clear_world(self):
        async with self._lock:
            self.world.clear()
            self._event("world cleared", "world")

    async def apply_intervention(self, fly_id: str, spec: dict) -> dict:
        async with self._lock:
            fly = self.flies.get(fly_id)
            if not fly:
                raise ValueError(f"unknown fly: {fly_id}")
            item = fly.interventions.apply(spec, self.t)
            self._event(
                f"{fly.name}: {item.type}" + (f" → {item.target}" if item.target else ""),
                "intervention",
                item.to_dict(),
            )
            return item.to_dict()

    async def set_sensory_gain(self, fly_id: str, gain: float):
        async with self._lock:
            fly = self.flies.get(fly_id)
            if not fly:
                raise ValueError(f"unknown fly: {fly_id}")
            fly.sensory_gain = max(0.0, min(2.0, float(gain)))
            self._event(f"{fly.name}: sensory gain = {fly.sensory_gain:.2f}", "control")

    def populations(self, fly_id: str) -> list[dict]:
        fly = self.flies.get(fly_id)
        if not fly:
            raise ValueError(f"unknown fly: {fly_id}")
        return fly.population_status()

    def metadata(self) -> dict:
        prime = self.flies["prime"]
        brain = prime.brain
        positions = getattr(brain, "positions", None)
        side = getattr(brain, "side", None)
        return {
            "neurons": int(brain.n),
            "synapses": int(len(brain.weights)),
            "dt": float(brain.dt),
            "max_flies": self.max_flies,
            "mock": self.mock,
            "has_positions": positions is not None,
            "has_side_metadata": side is not None,
            "motor_mapping": "Experimental Motor Mapping: side-specific descending-neuron spike-rate difference drives turn; total descending-neuron spike rate drives forward speed.",
        }

    def export_experiment(self) -> dict:
        return {
            "format": "flybox-experiment-v1",
            "seed": self.seed,
            "simulation_dt": self.dt,
            "time": self.t,
            "mock": self.mock,
            "world": self.world.to_dict(),
            "flies": [{
                "id": fly.id,
                "name": fly.name,
                "seed": fly.seed,
                "is_prime": fly.is_prime,
                "position": [fly.x, fly.y],
                "heading": fly.heading,
                "sensory_gain": fly.sensory_gain,
                "interventions": fly.interventions.serialized(),
                "trajectory": fly.trajectory,
            } for fly in self.flies.values()],
            "events": list(self.events),
        }

    async def import_experiment(self, payload: dict):
        if payload.get("format") != "flybox-experiment-v1":
            raise ValueError("unsupported experiment format")
        async with self._lock:
            self.running = False
            self.seed = int(payload.get("seed", 64))
            self.t = 0.0
            self.world = World(seed=self.seed)
            for item in payload.get("world", {}).get("objects", []):
                self.world.add(
                    item["kind"],
                    float(item["x"]),
                    float(item["y"]),
                    float(item.get("intensity", 0.8)),
                    float(item.get("radius", 0.04)),
                )
            self.flies = {}
            self._last_frames = {}
            self.events.clear()

            fly_rows = payload.get("flies") or []
            prime_row = next((row for row in fly_rows if row.get("is_prime")), None)
            if prime_row is None:
                prime_row = {
                    "id": "prime",
                    "name": "PRIME",
                    "seed": self.seed,
                    "position": [0.5, 0.5],
                    "heading": 0.0,
                    "sensory_gain": 1.0,
                    "interventions": [],
                }

            ordered = [prime_row] + [row for row in fly_rows if row is not prime_row]
            for index, row in enumerate(ordered[: self.max_flies]):
                is_prime = index == 0
                fly_id = "prime" if is_prime else str(row.get("id") or f"fly-import-{index}")
                position = row.get("position", [0.5, 0.5])
                fly = FlyAgent(
                    fly_id,
                    "PRIME" if is_prime else str(row.get("name", f"FLY {index + 1}")),
                    int(row.get("seed", self.seed + index)),
                    float(position[0]),
                    float(position[1]),
                    is_prime=is_prime,
                )
                fly.heading = float(row.get("heading", 0.0))
                fly.sensory_gain = float(row.get("sensory_gain", 1.0))
                for intervention in row.get("interventions", []):
                    # Configuration import reapplies reproducible active modifications
                    # at t=0. It does not claim to restore historical membrane voltages.
                    if intervention.get("type") in {
                        "silence_population",
                        "random_synapse_lesion",
                    } and intervention.get("active", True):
                        fly.interventions.apply(intervention, 0.0)
                self.flies[fly.id] = fly

            self._event(
                "experiment configuration imported; neural state restarted from seed",
                "system",
            )

    async def run_loop(self):
        while True:
            if not self.running or self.active_clients <= 0:
                await asyncio.sleep(0.05)
                continue
            started = time.perf_counter()
            await self.step_once()
            target = self.dt / max(0.25, self.speed)
            elapsed = time.perf_counter() - started
            await asyncio.sleep(max(0.0, target - elapsed))
