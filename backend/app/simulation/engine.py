from __future__ import annotations

import asyncio
import base64
from collections import deque
from datetime import date
import hashlib
import json
import os
import time
import uuid
import zlib

import numpy as np

from .challenges import ACHIEVEMENTS, CHALLENGES
from .fly import BODY_SPEED, FlyAgent
from .measurements import jaccard_distance
from .provenance import MOTOR_PROVENANCE, PROVENANCE, SENSORY_PROVENANCE
from .world import World


class SimulationEngine:
    def __init__(self, seed: int = 64):
        self.seed = seed
        self.world = World(seed=seed)
        self.flies: dict[str, FlyAgent] = {}
        self.max_flies = int(os.getenv("FLYLAB_MAX_FLIES", "4"))
        self.running = False
        self.speed = 1.0
        self.t = 0.0
        self.events = deque(maxlen=1600)
        self._lock = asyncio.Lock()
        self._last_frames: dict[str, dict] = {}
        self._started_at = time.time()
        self.active_clients = 0
        self.challenge_id = "sandbox"
        self.challenge_started = 0.0
        self.challenge_completed = False
        self.challenge_winner: str | None = None
        self.challenge_actions = 0
        self.mystery_secret: dict | None = None
        self.couplings: list[dict] = []
        self.achievements: set[str] = set()
        self._seen_food: dict[str, int] = {}
        self._seen_escape: dict[str, int] = {}
        self._seen_alive: dict[str, bool] = {}
        self._default_world()
        self._create_primary()

    @property
    def dt(self) -> float:
        return next(iter(self.flies.values())).dt

    @property
    def mock(self) -> bool:
        return any(fly.mock for fly in self.flies.values())

    def _default_world(self):
        self.world.clear()
        self.world.add("food", 0.78, 0.28, intensity=0.9, radius=0.027, amount=1.0, label="fruit")
        self.world.add("stimulus", 0.20, 0.72, intensity=0.8, radius=0.035, label="target")

    def _event(self, message: str, kind: str = "info", data: dict | None = None):
        self.events.append({
            "t": round(self.t, 3),
            "kind": kind,
            "message": message,
            "data": data or {},
        })

    def _award(self, key: str):
        if key in self.achievements or key not in ACHIEVEMENTS:
            return
        self.achievements.add(key)
        title, description = ACHIEVEMENTS[key]
        self._event(f"ACHIEVEMENT: {title}", "achievement", {"key": key, "description": description})

    def _create_primary(self):
        fly = FlyAgent("prime", "PRIME", self.seed, 0.50, 0.50, is_prime=True)
        self.flies[fly.id] = fly
        self._seen_food[fly.id] = 0
        self._seen_escape[fly.id] = 0
        self._seen_alive[fly.id] = True
        self._event("PRIME initialized", "system")

    async def step_once(self) -> dict:
        async with self._lock:
            self._apply_brain_couplings()
            self.world.update(self.dt)
            frames = []
            for fly in self.flies.values():
                frames.append(fly.step(self.world, self.t))
            self.t += self.dt
            self._last_frames = {frame["id"]: frame for frame in frames}
            self._evaluate_events(frames)
            self._evaluate_challenge(frames)
            return self.frame_payload()

    def _evaluate_events(self, frames: list[dict]):
        for frame in frames:
            fly_id = frame["id"]
            if frame["food_eaten"] > self._seen_food.get(fly_id, 0):
                self._seen_food[fly_id] = frame["food_eaten"]
                self._event(f'{frame["name"]} took a bite', "behavior", {"fly_id": fly_id})
                self._award("first_bite")
            if frame["escape_events"] > self._seen_escape.get(fly_id, 0):
                self._seen_escape[fly_id] = frame["escape_events"]
                self._event(f'{frame["name"]} triggered an escape response', "behavior", {"fly_id": fly_id})
                self._award("escape_artist")
            was_alive = self._seen_alive.get(fly_id, True)
            if was_alive and not frame["alive"]:
                self._event(f'{frame["name"]} is out: {frame["state"]}', "behavior", {"fly_id": fly_id})
            self._seen_alive[fly_id] = frame["alive"]
            if frame["energy"] < 25:
                self._award("why_did_you_do_that")
        if len(self.flies) >= 3:
            self._award("party_box")
        if self.t >= 60 and any(frame["alive"] for frame in frames):
            self._award("survivor")

    def _evaluate_challenge(self, frames: list[dict]):
        if self.challenge_completed:
            return
        challenge = CHALLENGES[self.challenge_id]
        goal = challenge["goal"]
        if goal == "food":
            total = sum(frame["food_eaten"] for frame in frames)
            if total >= challenge["target"]:
                self._complete_challenge("food target reached")
        elif goal == "survive":
            elapsed = self.t - self.challenge_started
            if elapsed >= challenge["target"] and any(frame["alive"] for frame in frames):
                self._complete_challenge("survival time reached")
        elif goal == "dn_activity":
            if any(frame["dn_activity"] >= challenge["target"] for frame in frames):
                self._complete_challenge("descending-neuron target reached")
        elif goal == "race":
            for frame in frames:
                if frame["alive"] and self.world.goal_reached(frame["x"], frame["y"]):
                    self.challenge_winner = frame["id"]
                    self._complete_challenge(f'{frame["name"]} reached the goal')
                    break
        elif goal == "first_food":
            target = int(challenge.get("target", 1))
            for frame in frames:
                if frame["food_eaten"] >= target:
                    self.challenge_winner = frame["id"]
                    self._complete_challenge(f'{frame["name"]} reached {target} bites')
                    break

    def _complete_challenge(self, reason: str):
        self.challenge_completed = True
        self._event(f"CHALLENGE COMPLETE: {reason}", "challenge")

    def comparisons(self) -> list[dict]:
        agents = list(self.flies.values())
        out: list[dict] = []
        for i in range(len(agents)):
            for j in range(i + 1, len(agents)):
                a, b = agents[i], agents[j]
                out.append({
                    "a": a.id,
                    "b": b.id,
                    "a_name": a.name,
                    "b_name": b.name,
                    "neural_divergence": jaccard_distance(a.previous_fired, b.previous_fired),
                    "behavioral_divergence": float(np.hypot(a.x - b.x, a.y - b.y)),
                    "energy_delta": abs(a.energy - b.energy),
                })
        return out

    def challenge_state(self) -> dict:
        challenge = CHALLENGES[self.challenge_id]
        return {
            "id": self.challenge_id,
            **challenge,
            "started": self.challenge_started,
            "elapsed": max(0.0, self.t - self.challenge_started),
            "completed": self.challenge_completed,
            "winner": self.challenge_winner,
            "actions": self.challenge_actions,
            "secret_hidden": self.mystery_secret is not None and not self.challenge_completed,
        }

    def frame_payload(self) -> dict:
        frames = list(self._last_frames.values())
        if not frames:
            frames = [fly._frame([], {}, {}, 0.0, {}, self.t) for fly in self.flies.values()]
        return {
            "type": "frame",
            "t": round(self.t, 3),
            "running": self.running,
            "speed": self.speed,
            "mock": self.mock,
            "viewers": self.active_clients,
            "flies": frames,
            "world": self.world.to_dict(),
            "events": list(self.events)[-40:],
            "challenge": self.challenge_state(),
            "achievements": [
                {"key": key, "title": ACHIEVEMENTS[key][0], "description": ACHIEVEMENTS[key][1]}
                for key in sorted(self.achievements)
            ],
            "couplings": list(self.couplings),
            "comparisons": self.comparisons(),
        }

    async def reset(self):
        async with self._lock:
            controller = self.flies.get("prime").controller if "prime" in self.flies else "play"
            self.running = False
            self.t = 0.0
            self.world = World(seed=self.seed)
            self.flies = {}
            self._last_frames = {}
            self.events.clear()
            self.achievements.clear()
            self._seen_food.clear()
            self._seen_escape.clear()
            self._seen_alive.clear()
            self.challenge_id = "sandbox"
            self.challenge_started = 0.0
            self.challenge_completed = False
            self.challenge_winner = None
            self.challenge_actions = 0
            self.mystery_secret = None
            self.couplings.clear()
            self._default_world()
            self._create_primary()
            self.flies["prime"].controller = controller

    def _apply_brain_couplings(self):
        for link in self.couplings:
            source_frame = self._last_frames.get(link["source"])
            target = self.flies.get(link["target"])
            if source_frame is None or target is None or not target.alive:
                continue
            amount = float(np.clip(source_frame.get("dn_activity", 0.0) * link["gain"], 0, 0.8))
            if amount <= 0:
                continue
            try:
                idx = target.interventions.population(link["population"])
            except Exception:
                continue
            if len(idx):
                target.interventions.pending_stimulation.append((idx, amount))

    async def connect_brains(self, source: str, target: str, population: str, gain: float):
        async with self._lock:
            if source == target:
                raise ValueError("source and target must be different agents")
            self._get_fly(source)
            target_fly = self._get_fly(target)
            if len(target_fly.interventions.population(population)) == 0:
                raise ValueError(f"unknown or empty target population: {population}")
            link = {
                "source": source,
                "target": target,
                "population": population,
                "gain": float(gain),
                "kind": "experimental_artificial_coupling",
            }
            self.couplings = [
                item for item in self.couplings
                if not (item["source"] == source and item["target"] == target)
            ]
            self.couplings.append(link)
            self._event(
                f'{self.flies[source].name} brain → {self.flies[target].name} {population}',
                "game",
                link,
            )
            return link

    async def disconnect_brains(self):
        async with self._lock:
            count = len(self.couplings)
            self.couplings.clear()
            self._event(f"disconnected {count} artificial brain links", "game")

    async def add_fly(
        self,
        clone_prime: bool = False,
        name: str | None = None,
        body_type: str = "fly",
        controller: str | None = None,
    ) -> dict:
        async with self._lock:
            if len(self.flies) >= self.max_flies:
                raise ValueError(f"resource limit: maximum {self.max_flies} full FlyBrain instances")
            fly_id = f"fly-{uuid.uuid4().hex[:5]}"
            index = len(self.flies)
            seed = self.seed + index
            chosen_controller = controller or self.flies["prime"].controller
            fly = FlyAgent(
                fly_id,
                name or f"FLY {index + 1}",
                seed,
                0.42 + index * 0.055,
                0.52 + (index % 2) * 0.06,
                controller=chosen_controller,
                body_type=body_type,
            )
            if clone_prime:
                prime = self.flies["prime"]
                fly.x, fly.y, fly.heading = prime.x, prime.y, prime.heading
                fly.sensory_gain = prime.sensory_gain
                fly.controller = prime.controller
                fly.body_type = prime.body_type
            self.flies[fly_id] = fly
            self._seen_food[fly_id] = 0
            self._seen_escape[fly_id] = 0
            self._seen_alive[fly_id] = True
            self._event(f"{fly.name} spawned", "system", {"fly_id": fly_id})
            return {"id": fly.id, "name": fly.name}

    async def fork_fly(self, fly_id: str) -> dict:
        async with self._lock:
            source = self.flies.get(fly_id)
            if not source:
                raise ValueError(f"unknown fly: {fly_id}")
            if len(self.flies) >= self.max_flies:
                raise ValueError(f"resource limit: maximum {self.max_flies} full FlyBrain instances")
            fork_id = f"fork-{uuid.uuid4().hex[:5]}"
            fork = FlyAgent(
                fork_id,
                f"{source.name}′",
                source.seed,
                source.x,
                source.y,
                controller=source.controller,
                body_type=source.body_type,
            )
            if not source.copy_runtime_state_to(fork):
                raise ValueError("exact neural-state fork is currently supported only for CPU/mock FlyBrain")
            self.flies[fork_id] = fork
            self._seen_food[fork_id] = fork.food_eaten
            self._seen_escape[fork_id] = fork.escape_events
            self._seen_alive[fork_id] = fork.alive
            self._event(f"{source.name} forked into {fork.name}", "fork", {"source": fly_id, "fork": fork_id})
            return {"id": fork.id, "name": fork.name, "exact": True}

    async def remove_fly(self, fly_id: str):
        async with self._lock:
            if fly_id == "prime":
                raise ValueError("the primary agent cannot be removed")
            if fly_id in self.flies:
                name = self.flies[fly_id].name
                del self.flies[fly_id]
                self._last_frames.pop(fly_id, None)
                self._event(f"{name} removed", "system")

    async def rename_fly(self, fly_id: str, name: str):
        async with self._lock:
            fly = self._get_fly(fly_id)
            fly.name = (name.strip() or fly.name)[:28]
            self._event(f"agent renamed to {fly.name}", "system", {"fly_id": fly_id})

    async def set_body(self, fly_id: str, body_type: str):
        async with self._lock:
            fly = self._get_fly(fly_id)
            fly.set_body(body_type)
            self._event(f"{fly.name} body → {body_type}", "game", {"fly_id": fly_id})

    async def set_controller(self, fly_id: str, controller: str):
        async with self._lock:
            fly = self._get_fly(fly_id)
            fly.set_controller(controller)
            self._event(f"{fly.name} controller → {controller.upper()}", "game", {"fly_id": fly_id})

    async def manual_drive(self, fly_id: str, turn: float, throttle: float):
        async with self._lock:
            fly = self._get_fly(fly_id)
            fly.manual_drive(turn, throttle, self.t + 0.18)

    def _get_fly(self, fly_id: str) -> FlyAgent:
        fly = self.flies.get(fly_id)
        if not fly:
            raise ValueError(f"unknown fly: {fly_id}")
        return fly

    async def add_world_object(self, payload: dict) -> dict:
        async with self._lock:
            obj = self.world.add(
                payload["kind"],
                payload["x"],
                payload["y"],
                payload.get("intensity", 0.8),
                payload.get("radius", 0.04),
                payload.get("amount", 1.0),
                payload.get("vx", 0.0),
                payload.get("vy", 0.0),
                payload.get("label"),
            )
            self._event(f"{obj.kind} added", "world", {"id": obj.id, "x": obj.x, "y": obj.y})
            return vars(obj)

    async def move_world_object(self, object_id: str, x: float, y: float):
        async with self._lock:
            obj = next((item for item in self.world.objects if item.id == object_id), None)
            if not obj:
                raise ValueError(f"unknown world object: {object_id}")
            obj.x = min(1.0, max(0.0, float(x)))
            obj.y = min(1.0, max(0.0, float(y)))

    async def remove_world_object(self, object_id: str):
        async with self._lock:
            self.world.remove(object_id)
            self._event("world object removed", "world", {"id": object_id})

    async def clear_world(self):
        async with self._lock:
            self.world.clear()
            self._event("world cleared", "world")

    async def randomize_world(self, seed: int | None = None):
        async with self._lock:
            seed = self.seed if seed is None else int(seed)
            rng = np.random.default_rng(seed)
            self.world = World(seed=seed)
            for _ in range(4):
                self.world.add("food", rng.uniform(.08, .92), rng.uniform(.08, .92), radius=.024, amount=1.0)
            for _ in range(5):
                self.world.add("obstacle", rng.uniform(.12, .88), rng.uniform(.12, .88), radius=rng.uniform(.025, .07))
            self.world.add("loom", rng.uniform(.12, .88), rng.uniform(.12, .88), intensity=1.0, radius=.035)
            self.world.add("sound", rng.uniform(.12, .88), rng.uniform(.12, .88), intensity=.65, radius=.025, amount=3.0)
            self._event(f"world randomized with seed {seed}", "world", {"seed": seed})

    async def daily_world(self):
        token = date.today().isoformat().encode()
        seed = int.from_bytes(hashlib.sha256(token).digest()[:4], "big")
        await self.randomize_world(seed)
        return seed

    async def apply_intervention(self, fly_id: str, spec: dict) -> dict:
        async with self._lock:
            fly = self._get_fly(fly_id)
            if self.challenge_id == "hijack":
                budget = CHALLENGES["hijack"]["budget"]
                if self.challenge_actions >= budget:
                    raise ValueError(f"challenge budget exhausted ({budget} actions)")
                self.challenge_actions += 1
            item = fly.interventions.apply(spec, self.t)
            self._event(
                f"{fly.name}: {item.type}" + (f" → {item.target}" if item.target else ""),
                "intervention",
                item.to_dict(),
            )
            self._award("brain_surgeon")
            if item.type == "random_synapse_lesion":
                self._award("chaos_theory")
            return item.to_dict()

    async def set_sensory_gain(self, fly_id: str, gain: float):
        async with self._lock:
            fly = self._get_fly(fly_id)
            fly.sensory_gain = max(0.0, min(2.0, float(gain)))
            self._event(f"{fly.name}: sensory gain = {fly.sensory_gain:.2f}", "control")

    async def start_challenge(self, challenge_id: str):
        if challenge_id not in CHALLENGES:
            raise ValueError(f"unknown challenge: {challenge_id}")
        async with self._lock:
            self.challenge_id = challenge_id
            self.challenge_started = self.t
            self.challenge_completed = False
            self.challenge_winner = None
            self.challenge_actions = 0
            self.mystery_secret = None

            if challenge_id == "race":
                self.world.clear()
                self.world.add("goal", .90, .50, intensity=1.0, radius=.045, label="FINISH")
                for y in (.30, .70):
                    self.world.add("obstacle", .52, y, radius=.09)
                for fly in self.flies.values():
                    fly.x, fly.y, fly.heading = .10, .45 + .08 * (len(fly.id) % 2), 0.0
            elif challenge_id == "food_run":
                self.world.clear()
                for x, y in ((.2,.2),(.8,.2),(.2,.8),(.8,.8),(.5,.5)):
                    self.world.add("food", x, y, intensity=1.0, radius=.025, amount=1.0)
            elif challenge_id == "maze":
                self.world.clear()
                self.world.add("food", .90, .50, intensity=1.0, radius=.03, amount=1.0)
                walls = [
                    (.30,.25,.035),(.30,.35,.035),(.30,.45,.035),(.30,.55,.035),
                    (.30,.65,.035),(.52,.35,.035),(.52,.45,.035),(.52,.55,.035),
                    (.72,.25,.035),(.72,.35,.035),(.72,.65,.035),(.72,.75,.035),
                ]
                for x, y, radius in walls:
                    self.world.add("obstacle", x, y, radius=radius)
                for i, fly in enumerate(self.flies.values()):
                    fly.x, fly.y, fly.heading = .08, .44 + i * .04, 0.0
            elif challenge_id == "tournament":
                self.world.clear()
                for x, y in ((.22,.22),(.78,.22),(.22,.78),(.78,.78),(.50,.50)):
                    self.world.add("food", x, y, intensity=1.0, radius=.025, amount=1.0)
                while len(self.flies) < min(3, self.max_flies):
                    index = len(self.flies)
                    fly_id = f"fly-{uuid.uuid4().hex[:5]}"
                    body = ["fly", "bot", "car"][index % 3]
                    fly = FlyAgent(fly_id, f"RIVAL {index}", self.seed + index * 13, .12, .35 + index * .15, controller="play", body_type=body)
                    self.flies[fly_id] = fly
                    self._seen_food[fly_id] = 0
                    self._seen_escape[fly_id] = 0
                    self._seen_alive[fly_id] = True
            elif challenge_id == "survive":
                self.world.add("predator", .85, .5, intensity=1.0, radius=.05, vx=-.055, vy=.035, label="PREDATOR")
            elif challenge_id == "mystery":
                if len(self.flies) < 2:
                    fly_id = f"fly-{uuid.uuid4().hex[:5]}"
                    fly = FlyAgent(fly_id, "MYSTERY", self.seed + 33, .60, .50, controller=self.flies["prime"].controller)
                    self.flies[fly_id] = fly
                    self._seen_food[fly_id] = 0
                    self._seen_escape[fly_id] = 0
                    self._seen_alive[fly_id] = True
                candidates = ["LC4", "LPLC2", "LC10a"]
                target = candidates[self.seed % len(candidates)]
                mystery = next(f for f in self.flies.values() if not f.is_prime)
                mystery.interventions.apply({"type": "silence_population", "target": target}, self.t)
                self.mystery_secret = {"fly_id": mystery.id, "type": "silence_population", "target": target}

            self._event(f'challenge started: {CHALLENGES[challenge_id]["name"]}', "challenge")

    def reveal_mystery(self) -> dict | None:
        if self.challenge_id != "mystery":
            return None
        self.challenge_completed = True
        if self.mystery_secret:
            self._event(f'MYSTERY REVEALED: {self.mystery_secret["target"]} silenced', "challenge")
        return self.mystery_secret

    async def console(self, command: str) -> dict:
        parts = command.strip().split()
        if not parts:
            raise ValueError("empty command")
        cmd = parts[0].lower()
        if cmd == "stim" and len(parts) >= 2:
            target = parts[1]
            amount = float(parts[2]) if len(parts) > 2 else 0.8
            return await self.apply_intervention("prime", {"type": "stimulate_population", "target": target, "amount": amount})
        if cmd == "silence" and len(parts) >= 2:
            return await self.apply_intervention("prime", {"type": "silence_population", "target": parts[1]})
        if cmd == "restore" and len(parts) >= 2:
            return await self.apply_intervention("prime", {"type": "restore_population", "target": parts[1]})
        if cmd == "spawn" and len(parts) >= 2:
            kind = parts[1]
            x = float(parts[2]) if len(parts) > 2 else 0.5
            y = float(parts[3]) if len(parts) > 3 else 0.5
            return await self.add_world_object({"kind": kind, "x": x, "y": y})
        if cmd == "fork":
            return await self.fork_fly(parts[1] if len(parts) > 1 else "prime")
        if cmd == "random":
            await self.randomize_world(int(parts[1]) if len(parts) > 1 else None)
            return {"ok": True}
        if cmd == "challenge" and len(parts) >= 2:
            await self.start_challenge(parts[1])
            return self.challenge_state()
        raise ValueError("commands: stim, silence, restore, spawn, fork, random, challenge")

    def populations(self, fly_id: str) -> list[dict]:
        return self._get_fly(fly_id).population_status()

    def metadata(self) -> dict:
        primary = self.flies["prime"]
        brain = primary.brain
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
            "bodies": list(BODY_SPEED),
            "challenges": CHALLENGES,
            "provenance": PROVENANCE,
            "sensory_provenance": SENSORY_PROVENANCE,
            "motor_provenance": MOTOR_PROVENANCE,
            "motor_mapping": "Named DNg100/DNa02/DNp01/MDN activity feeds an explicit engineering body decoder. PLAY adds a labeled locomotion/foraging assist; LAB removes it.",
        }

    def export_experiment(self) -> dict:
        return {
            "format": "flybox-experiment-v2",
            "seed": self.seed,
            "simulation_dt": self.dt,
            "time": self.t,
            "mock": self.mock,
            "challenge": self.challenge_state(),
            "achievements": sorted(self.achievements),
            "world": self.world.to_dict(),
            "flies": [{
                "id": fly.id,
                "name": fly.name,
                "seed": fly.seed,
                "is_prime": fly.is_prime,
                "body_type": fly.body_type,
                "controller": fly.controller,
                "position": [fly.x, fly.y],
                "heading": fly.heading,
                "energy": fly.energy,
                "sensory_gain": fly.sensory_gain,
                "interventions": fly.interventions.serialized(),
                "trajectory": fly.trajectory,
            } for fly in self.flies.values()],
            "events": list(self.events),
            "couplings": list(self.couplings),
        }

    def share_code(self) -> str:
        payload = {
            "format": "flybox-share-v1",
            "seed": self.seed,
            "challenge_id": self.challenge_id,
            "world": self.world.to_dict(),
            "flies": [{
                "id": fly.id,
                "name": fly.name,
                "seed": fly.seed,
                "is_prime": fly.is_prime,
                "body_type": fly.body_type,
                "controller": fly.controller,
                "position": [fly.x, fly.y],
                "heading": fly.heading,
                "energy": fly.energy,
                "sensory_gain": fly.sensory_gain,
                "interventions": fly.interventions.serialized(),
            } for fly in self.flies.values()],
        }
        raw = json.dumps(payload, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(zlib.compress(raw, 9)).decode().rstrip("=")

    async def import_share_code(self, code: str):
        try:
            padded = code + "=" * (-len(code) % 4)
            raw = zlib.decompress(base64.urlsafe_b64decode(padded.encode()))
            payload = json.loads(raw)
        except Exception as exc:
            raise ValueError("invalid FLYBOX share code") from exc
        if payload.get("format") != "flybox-share-v1":
            raise ValueError("unsupported FLYBOX share code")
        challenge_id = payload.get("challenge_id", "sandbox")
        experiment = {
            "format": "flybox-experiment-v2",
            "seed": payload.get("seed", 64),
            "world": payload.get("world", {}),
            "flies": payload.get("flies", []),
        }
        await self.import_experiment(experiment)
        if challenge_id in CHALLENGES:
            self.challenge_id = challenge_id
            self.challenge_started = self.t
        self._event("shared box imported", "system")

    async def import_experiment(self, payload: dict):
        if payload.get("format") not in {"flybox-experiment-v1", "flybox-experiment-v2"}:
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
                    float(item.get("amount", 1.0)),
                    float(item.get("vx", 0.0)),
                    float(item.get("vy", 0.0)),
                    item.get("label"),
                )
            self.flies = {}
            self._last_frames = {}
            self.events.clear()
            self.couplings.clear()
            self._seen_food.clear()
            self._seen_escape.clear()
            self._seen_alive.clear()

            fly_rows = payload.get("flies") or []
            primary_row = next((row for row in fly_rows if row.get("is_prime")), None)
            if primary_row is None:
                primary_row = {"id": "prime", "name": "PRIME", "seed": self.seed, "position": [0.5,0.5]}

            ordered = [primary_row] + [row for row in fly_rows if row is not primary_row]
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
                    controller=str(row.get("controller", "play")),
                    body_type=str(row.get("body_type", "fly")),
                )
                fly.heading = float(row.get("heading", 0.0))
                fly.energy = float(row.get("energy", 72.0))
                fly.sensory_gain = float(row.get("sensory_gain", 1.0))
                for intervention in row.get("interventions", []):
                    if intervention.get("type") in {"silence_population", "random_synapse_lesion"} and intervention.get("active", True):
                        fly.interventions.apply(intervention, 0.0)
                self.flies[fly.id] = fly
                self._seen_food[fly.id] = fly.food_eaten
                self._seen_escape[fly.id] = fly.escape_events
                self._seen_alive[fly.id] = fly.alive

            self._event("experiment configuration imported; neural state restarted from seed", "system")

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
