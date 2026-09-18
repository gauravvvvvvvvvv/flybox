from __future__ import annotations

import math
import os
import numpy as np

from .interventions import InterventionManager
from .mappings import build_sensory_injections, experimental_motor_mapping
from .measurements import jaccard_distance

KNOWN_POPS = ["LC4", "LPLC2", "LC10a", "LC6", "LC16", "LC15", "descending_neuron"]


class FlyAgent:
    def __init__(self, fly_id: str, name: str, seed: int, x: float, y: float, is_prime: bool = False):
        self.id = fly_id
        self.name = name
        self.seed = seed
        self.x = float(x)
        self.y = float(y)
        self.heading = 0.0
        self.velocity = 0.0
        self.energy = 100.0
        self.alive = True
        self.is_prime = is_prime
        self.sensory_gain = 1.0
        self.trajectory: list[dict] = []
        self.previous_fired = np.empty(0, dtype=np.int64)
        self._load_brain()

    def _load_brain(self):
        if os.getenv("FLYLAB_MOCK", "0") == "1":
            from .mockbrain import MockBrain, MockTrace
            self.brain = MockBrain(seed=self.seed)
            Trace = MockTrace
            self.mock = True
        else:
            from flybrain import FlyBrain, Trace
            self.brain = FlyBrain(device=os.getenv("FLY_DEVICE", "auto"), seed=self.seed)
            self.mock = False

        self.interventions = InterventionManager(self.brain)
        self.dn_idx = np.asarray(self.brain.cells(["descending_neuron"]), dtype=np.int64)
        self.dn_left = np.asarray(self.brain.cells(["descending_neuron"], side="L"), dtype=np.int64)
        self.dn_right = np.asarray(self.brain.cells(["descending_neuron"], side="R"), dtype=np.int64)
        self.dn_trace = Trace(self.brain, types=["descending_neuron"], tau=0.1, aggregate="mean")
        self.population_cache = {
            name: np.asarray(self.brain.cells([name]), dtype=np.int64)
            for name in KNOWN_POPS
        }

    @property
    def dt(self) -> float:
        return float(self.brain.dt)

    def reset(self):
        self.brain.reset(self.seed)
        self.dn_trace.reset()
        self.previous_fired = np.empty(0, dtype=np.int64)
        self.energy = 100.0
        self.heading = 0.0
        self.velocity = 0.0
        self.trajectory.clear()
        self.interventions = InterventionManager(self.brain)

    def step(self, world, t: float) -> dict:
        targets = world.sensory_targets(self.x, self.y, self.heading)
        inject = build_sensory_injections(self.brain, targets, self.sensory_gain)
        inject.extend(self.interventions.injections())

        fired = np.asarray(self.brain.step(inject=inject), dtype=np.int64)
        fired = self.interventions.filter_fired(fired)
        trace = np.asarray(self.dn_trace.observe(fired))

        left_count = np.intersect1d(fired, self.dn_left, assume_unique=False).size
        right_count = np.intersect1d(fired, self.dn_right, assume_unique=False).size
        dn_count = np.intersect1d(fired, self.dn_idx, assume_unique=False).size
        left_rate = left_count / max(1, len(self.dn_left))
        right_rate = right_count / max(1, len(self.dn_right))
        total_rate = dn_count / max(1, len(self.dn_idx))
        turn, speed = experimental_motor_mapping(left_rate, right_rate, total_rate)

        old_x, old_y = self.x, self.y
        self.heading = (self.heading + turn * self.dt) % (2 * math.pi)
        self.velocity = speed
        nx = self.x + math.cos(self.heading) * speed * self.dt
        ny = self.y + math.sin(self.heading) * speed * self.dt
        self.x, self.y = world.collide_and_clamp(nx, ny, old_x, old_y)

        if world.consume_food(self.x, self.y):
            self.energy = min(100.0, self.energy + 20.0)
        self.energy = max(0.0, self.energy - 0.002)

        jac = jaccard_distance(self.previous_fired, fired)
        newly = np.setdiff1d(fired, self.previous_fired, assume_unique=False).size
        self.previous_fired = fired.copy()
        point = {"t": round(t, 3), "x": self.x, "y": self.y}
        self.trajectory.append(point)
        if len(self.trajectory) > 3000:
            self.trajectory = self.trajectory[-3000:]

        return {
            "id": self.id,
            "name": self.name,
            "is_prime": self.is_prime,
            "x": self.x,
            "y": self.y,
            "heading": self.heading,
            "speed": self.velocity,
            "energy": self.energy,
            "fired_count": int(fired.size),
            "firing_fraction": float(fired.size / self.brain.n),
            "newly_firing": int(newly),
            "firing_jaccard_distance": jac,
            "dn_activity": float(trace.mean()) if trace.size else 0.0,
            "dn_fired": int(dn_count),
            "sensory_targets": len(targets),
            "sampled_fired": fired[:256].astype(int).tolist(),
            "interventions": self.interventions.serialized()[-8:],
        }

    def population_status(self) -> list[dict]:
        rows = []
        for name, idx in self.population_cache.items():
            count = int(np.intersect1d(self.previous_fired, idx, assume_unique=False).size)
            rows.append({
                "name": name,
                "neurons": int(len(idx)),
                "firing": count,
                "silenced": name in self.interventions.silenced,
            })
        return rows
