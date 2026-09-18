from __future__ import annotations

import copy
import math
import os
import numpy as np

from .interventions import InterventionManager
from .mappings import MotorDecoder, SensoryEncoder
from .measurements import jaccard_distance

KNOWN_POPS = [
    "LC4", "LPLC2", "LPLC1", "LC10a", "LC6", "LC16", "LC15",
    "ORN_DM1", "ORN_DM2", "SNta",
    "DNg100", "DNa02", "DNp01", "MDN", "descending_neuron",
]

BODY_SPEED = {
    "fly": 1.0,
    "car": 1.45,
    "bot": 0.8,
    "drone": 1.3,
    "walker": 0.65,
    "ship": 1.7,
    "synth": 0.0,
}


class FlyAgent:
    def __init__(
        self,
        fly_id: str,
        name: str,
        seed: int,
        x: float,
        y: float,
        is_prime: bool = False,
        controller: str = "play",
        body_type: str = "fly",
    ):
        self.id = fly_id
        self.name = name
        self.seed = seed
        self.x = float(x)
        self.y = float(y)
        self.heading = 0.0
        self.velocity = 0.0
        self.energy = 72.0
        self.alive = True
        self.is_prime = is_prime
        self.controller = controller
        self.body_type = body_type if body_type in BODY_SPEED else "fly"
        self.sensory_gain = 1.0
        self.trajectory: list[dict] = []
        self.previous_fired = np.empty(0, dtype=np.int64)
        self.touch_side: str | None = None
        self.previous_odor = 0.0
        self.food_eaten = 0
        self.escape_events = 0
        self.last_escape = 0.0
        self.state = "IDLE"
        self.manual_turn = 0.0
        self.manual_throttle = 0.0
        self.manual_until = -1.0
        self.rng = np.random.default_rng(seed + 9001)
        self._load_brain()

    def _load_brain(self):
        if os.getenv("FLYLAB_MOCK", "0") == "1":
            from .mockbrain import MockBrain, MockTrace
            self.brain = MockBrain(seed=self.seed)
            Trace = MockTrace
            self.mock = True
        else:
            from flybrain import FlyBrain, Trace
            self.brain = FlyBrain(
                device=os.getenv("FLY_DEVICE", "auto"),
                seed=self.seed,
                sensory_input=os.getenv("FLYLAB_NATIVE_SENSORY_RECURRENT", "0") == "1",
            )
            self.mock = False

        self.interventions = InterventionManager(self.brain)
        self.dn_idx = np.asarray(self.brain.cells(["descending_neuron"]), dtype=np.int64)
        self.dn_trace = Trace(self.brain, types=["descending_neuron"], tau=0.1, aggregate="mean")
        self.encoder = SensoryEncoder(self.brain)
        self.motor = MotorDecoder(self.brain)
        self.population_cache = {
            name: np.asarray(self.brain.cells([name]), dtype=np.int64)
            for name in KNOWN_POPS
        }
        self._prepare_brain_view()

    def _prepare_brain_view(self) -> None:
        self._brain_norm: np.ndarray | None = None
        self._brain_static_points: list[list[float | int]] = []
        self._brain_mapped = 0
        self._brain_view_kind = "unavailable"

        positions = getattr(self.brain, "positions", None)
        if positions is None:
            self._brain_view_kind = "mock-unavailable" if self.mock else "unavailable"
            return

        positions = np.asarray(positions)
        if positions.ndim != 2 or positions.shape[0] != self.brain.n or positions.shape[1] < 3:
            return

        ok = ~np.isnan(positions[:, :3]).any(axis=1)
        ids = np.flatnonzero(ok)
        if ids.size == 0:
            return

        # Same anatomical projection used by FlyBrain's own dashboard:
        # EM x = left/right; z = long brain->nerve-cord axis.
        xy = positions[ok][:, [0, 2]].astype(np.float32, copy=True)
        side = np.asarray(getattr(self.brain, "side", np.array([""] * self.brain.n)))[ok]
        left = side == "L"
        right = side == "R"
        if left.any() and right.any() and np.nanmean(xy[right, 0]) < np.nanmean(xy[left, 0]):
            xy[:, 0] *= -1

        lo = np.percentile(xy, 0.2, axis=0)
        hi = np.percentile(xy, 99.8, axis=0)
        span = hi - lo
        scale = float(max(span.max(), 1e-6))
        pad = (scale - span) / 2.0
        norm = np.clip((xy - lo + pad) / scale, 0, 1)

        full = np.full((self.brain.n, 2), np.nan, dtype=np.float32)
        full[ids] = norm
        self._brain_norm = full
        self._brain_mapped = int(ids.size)
        self._brain_view_kind = "anatomical"

        sample_count = min(3500, ids.size)
        pick = np.linspace(0, ids.size - 1, sample_count, dtype=np.int64)
        chosen = ids[pick]
        coords = full[chosen]
        self._brain_static_points = [
            [int(neuron_id), round(float(pos[0]), 4), round(float(pos[1]), 4)]
            for neuron_id, pos in zip(chosen, coords)
        ]

    def brain_view_static(self) -> dict:
        return {
            "kind": self._brain_view_kind,
            "projection": "MaleCNS soma positions projected on EM x/z axes" if self._brain_view_kind == "anatomical" else None,
            "mapped": self._brain_mapped,
            "neurons": int(self.brain.n),
            "points": self._brain_static_points,
        }

    def _brain_firing_positions(self, fired: np.ndarray, limit: int = 512) -> list[list[float | int]]:
        if self._brain_norm is None or fired.size == 0:
            return []
        fired = np.asarray(fired, dtype=np.int64)
        coords = self._brain_norm[fired]
        valid = ~np.isnan(coords).any(axis=1)
        fired = fired[valid]
        coords = coords[valid]
        if fired.size > limit:
            pick = np.linspace(0, fired.size - 1, limit, dtype=np.int64)
            fired = fired[pick]
            coords = coords[pick]
        return [
            [int(neuron_id), round(float(pos[0]), 4), round(float(pos[1]), 4)]
            for neuron_id, pos in zip(fired, coords)
        ]

    @property
    def dt(self) -> float:
        return float(self.brain.dt)

    @property
    def hunger(self) -> float:
        return float(np.clip(1.0 - self.energy / 100.0, 0, 1))

    def set_controller(self, controller: str):
        if controller not in {"play", "lab"}:
            raise ValueError("controller must be play or lab")
        self.controller = controller

    def set_body(self, body_type: str):
        if body_type not in BODY_SPEED:
            raise ValueError(f"unsupported body: {body_type}")
        self.body_type = body_type

    def manual_drive(self, turn: float, throttle: float, until: float):
        self.manual_turn = float(np.clip(turn, -1, 1))
        self.manual_throttle = float(np.clip(throttle, -1, 1))
        self.manual_until = float(until)

    def reset(self):
        self.brain.reset(self.seed)
        self.dn_trace.reset()
        self.previous_fired = np.empty(0, dtype=np.int64)
        self.energy = 72.0
        self.heading = 0.0
        self.velocity = 0.0
        self.trajectory.clear()
        self.interventions = InterventionManager(self.brain)
        self.encoder = SensoryEncoder(self.brain)
        self.motor = MotorDecoder(self.brain)
        self.touch_side = None
        self.previous_odor = 0.0
        self.food_eaten = 0
        self.escape_events = 0
        self.last_escape = 0.0
        self.state = "IDLE"
        self.alive = True

    def runtime_snapshot(self) -> dict:
        if not self.mock and getattr(self.brain, "device", "cpu") != "cpu":
            raise ValueError("exact checkpoints are currently supported only for CPU/mock FlyBrain")

        brain_state = {
            "fired": np.asarray(self.brain.fired).copy(),
            "rng_state": copy.deepcopy(self.brain.rng.bit_generator.state),
        }
        if not self.mock:
            brain_state.update({
                "v": np.asarray(self.brain.v).copy(),
                "steps": int(self.brain.steps),
                "last_spike": None if getattr(self.brain, "last_spike", None) is None else np.asarray(self.brain.last_spike).copy(),
            })

        return {
            "id": self.id,
            "name": self.name,
            "seed": self.seed,
            "is_prime": self.is_prime,
            "x": self.x,
            "y": self.y,
            "heading": self.heading,
            "velocity": self.velocity,
            "energy": self.energy,
            "alive": self.alive,
            "controller": self.controller,
            "body_type": self.body_type,
            "sensory_gain": self.sensory_gain,
            "trajectory": copy.deepcopy(self.trajectory),
            "previous_fired": self.previous_fired.copy(),
            "touch_side": self.touch_side,
            "previous_odor": self.previous_odor,
            "food_eaten": self.food_eaten,
            "escape_events": self.escape_events,
            "last_escape": self.last_escape,
            "state": self.state,
            "manual_turn": self.manual_turn,
            "manual_throttle": self.manual_throttle,
            "manual_until": self.manual_until,
            "game_rng_state": copy.deepcopy(self.rng.bit_generator.state),
            "brain": brain_state,
            "dn_trace": self.dn_trace.trace.copy(),
            "motor_smooth": dict(self.motor.smooth),
            "encoder_previous_size": dict(self.encoder.previous_size),
            "encoder_last": dict(self.encoder.last),
            "interventions": copy.deepcopy(self.interventions.serialized()),
            "pending_stimulation": [
                (idx.copy(), copy.deepcopy(amount))
                for idx, amount in self.interventions.pending_stimulation
            ],
        }

    def restore_runtime_snapshot(self, snapshot: dict) -> None:
        if not self.mock and getattr(self.brain, "device", "cpu") != "cpu":
            raise ValueError("exact checkpoint restore is currently supported only for CPU/mock FlyBrain")

        self.interventions.restore_all_synapse_lesions()
        self.brain.reset(self.seed)
        self.dn_trace.reset()
        self.interventions = InterventionManager(self.brain)
        for item in snapshot.get("interventions", []):
            if item.get("active") and item.get("type") in {"silence_population", "random_synapse_lesion"}:
                self.interventions.apply(item, float(item.get("time", 0.0)))
        self.interventions.pending_stimulation = [
            (np.asarray(idx).copy(), copy.deepcopy(amount))
            for idx, amount in snapshot.get("pending_stimulation", [])
        ]

        brain_state = snapshot["brain"]
        if not self.mock:
            self.brain.v[...] = brain_state["v"]
            self.brain.steps = int(brain_state["steps"])
            if self.brain.last_spike is not None and brain_state.get("last_spike") is not None:
                self.brain.last_spike[...] = brain_state["last_spike"]
        self.brain.fired = np.asarray(brain_state["fired"]).copy()
        self.brain.rng.bit_generator.state = copy.deepcopy(brain_state["rng_state"])

        self.name = snapshot["name"]
        self.x = float(snapshot["x"])
        self.y = float(snapshot["y"])
        self.heading = float(snapshot["heading"])
        self.velocity = float(snapshot["velocity"])
        self.energy = float(snapshot["energy"])
        self.alive = bool(snapshot["alive"])
        self.controller = snapshot["controller"]
        self.body_type = snapshot["body_type"]
        self.sensory_gain = float(snapshot["sensory_gain"])
        self.trajectory = copy.deepcopy(snapshot["trajectory"])
        self.previous_fired = np.asarray(snapshot["previous_fired"]).copy()
        self.touch_side = snapshot["touch_side"]
        self.previous_odor = float(snapshot["previous_odor"])
        self.food_eaten = int(snapshot["food_eaten"])
        self.escape_events = int(snapshot["escape_events"])
        self.last_escape = float(snapshot["last_escape"])
        self.state = snapshot["state"]
        self.manual_turn = float(snapshot["manual_turn"])
        self.manual_throttle = float(snapshot["manual_throttle"])
        self.manual_until = float(snapshot["manual_until"])
        self.rng.bit_generator.state = copy.deepcopy(snapshot["game_rng_state"])
        self.dn_trace.trace[...] = snapshot["dn_trace"]
        self.motor.smooth = dict(snapshot["motor_smooth"])
        self.encoder.previous_size = dict(snapshot["encoder_previous_size"])
        self.encoder.last = dict(snapshot["encoder_last"])

    def copy_runtime_state_to(self, other: "FlyAgent") -> bool:
        """Exact neural-state fork for CPU NumPy FlyBrain. Returns False when unsafe."""
        if self.mock and other.mock:
            other.brain.rng.bit_generator.state = copy.deepcopy(self.brain.rng.bit_generator.state)
            other.brain.fired = self.brain.fired.copy()
        elif getattr(self.brain, "device", "cpu") == "cpu" and getattr(other.brain, "device", "cpu") == "cpu":
            other.brain.v[...] = self.brain.v
            other.brain.fired = self.brain.fired.copy()
            if getattr(self.brain, "last_spike", None) is not None:
                other.brain.last_spike[...] = self.brain.last_spike
            other.brain.steps = self.brain.steps
            try:
                other.brain.rng.bit_generator.state = copy.deepcopy(self.brain.rng.bit_generator.state)
            except Exception:
                return False
        else:
            return False

        try:
            other.brain.weights[...] = self.brain.weights
        except Exception:
            return False
        other.interventions.items = copy.deepcopy(self.interventions.items)
        other.interventions.silenced = {
            key: value.copy() for key, value in self.interventions.silenced.items()
        }
        other.interventions.pending_stimulation = [
            (idx.copy(), amount) for idx, amount in self.interventions.pending_stimulation
        ]
        other.dn_trace.trace[...] = self.dn_trace.trace
        other.motor.smooth = dict(self.motor.smooth)
        other.encoder.previous_size = dict(self.encoder.previous_size)
        other.encoder.last = dict(self.encoder.last)
        try:
            other.rng.bit_generator.state = copy.deepcopy(self.rng.bit_generator.state)
        except Exception:
            pass

        other.x, other.y, other.heading = self.x, self.y, self.heading
        other.velocity = self.velocity
        other.energy = self.energy
        other.controller = self.controller
        other.body_type = self.body_type
        other.sensory_gain = self.sensory_gain
        other.previous_fired = self.previous_fired.copy()
        other.previous_odor = self.previous_odor
        other.touch_side = self.touch_side
        other.food_eaten = self.food_eaten
        other.escape_events = self.escape_events
        other.state = self.state
        return True

    def _play_assists(self, snapshot: dict, t: float, escape: float) -> tuple[float, float, dict]:
        """Transparent game-only locomotion aids; disabled entirely in LAB."""
        if self.controller != "play":
            return 0.0, 0.0, {"forage": 0.0, "avoid": 0.0, "search": 0.0}

        hunger = self.hunger
        food_items = snapshot["food"]
        odor = max((item["drive"] for item in food_items), default=0.0)
        forage_turn = 0.0
        if food_items and hunger > 0.15:
            strongest = max(food_items, key=lambda item: item["drive"])
            forage_turn = float(np.clip(strongest["bearing"] * strongest["drive"] * hunger * 2.2, -1.1, 1.1))

        predators = [item for item in snapshot["visual"] if item["object"].kind == "predator"]
        avoid_turn = 0.0
        if predators:
            nearest = min(predators, key=lambda item: item["distance"])
            proximity = float(np.clip((0.45 - nearest["distance"]) / 0.45, 0, 1))
            avoid_turn = float(np.clip(-nearest["bearing"] * proximity * 2.8, -1.8, 1.8))

        # Deterministic search wobble gives the embodied agent something to do when
        # the simplified connectome has no walking command. This is a GAME MECHANIC.
        search = math.sin(t * 0.71 + (self.seed % 31) * 0.17) * (0.22 + 0.25 * hunger)
        if odor > self.previous_odor:
            search *= 0.25
        self.previous_odor = odor

        throttle = 0.018 + hunger * 0.035
        if escape > 0.2:
            throttle += 0.08 * escape
        return forage_turn + avoid_turn + search, throttle, {
            "forage": forage_turn,
            "avoid": avoid_turn,
            "search": search,
        }

    def step(self, world, t: float) -> dict:
        if not self.alive:
            return self._frame([], {}, {}, 0.0, {}, t)

        snapshot = world.sensory_snapshot(self.x, self.y, self.heading, t)
        hunger_gain = 0.45 + 1.35 * self.hunger
        inject, eye_drive, senses = self.encoder.encode(
            snapshot,
            self.sensory_gain,
            hunger_gain,
            self.touch_side,
        )
        self.touch_side = None
        inject.extend(self.interventions.injections())

        fired = np.asarray(self.brain.step(eye_drive=eye_drive, inject=inject), dtype=np.int64)
        fired = self.interventions.filter_fired(fired)
        trace = np.asarray(self.dn_trace.observe(fired))
        motor = self.motor.observe(fired, self.dt)
        turn, speed, escape = self.motor.motion(motor, self.controller)

        assist_turn, assist_speed, assists = self._play_assists(snapshot, t, escape)
        turn += assist_turn
        speed += assist_speed

        if t <= self.manual_until:
            turn += self.manual_turn * 3.0
            speed += self.manual_throttle * 0.14
            self.state = "POSSESSED"

        if escape > 0.45 and self.last_escape <= 0.45:
            self.escape_events += 1
        self.last_escape = escape

        if self.body_type == "synth":
            speed = 0.0
        else:
            speed *= BODY_SPEED[self.body_type]

        old_x, old_y = self.x, self.y
        self.heading = (self.heading + turn * self.dt) % (2 * math.pi)
        self.velocity = float(np.clip(speed, -0.24, 0.28))
        nx = self.x + math.cos(self.heading) * self.velocity * self.dt
        ny = self.y + math.sin(self.heading) * self.velocity * self.dt
        if self.body_type != "synth":
            nx += world.wind_x * self.dt
            ny += world.wind_y * self.dt
        self.x, self.y, self.touch_side = world.collide_and_clamp(
            nx, ny, old_x, old_y, self.heading
        )

        feeding, eaten, finished_food = world.feed(self.x, self.y)
        if feeding and escape < 0.2:
            self.velocity = 0.0
            self.x, self.y = old_x, old_y
            self.energy = min(100.0, self.energy + eaten * 70.0)
            if finished_food:
                self.food_eaten += 1
            self.state = "FEEDING"
        elif escape > 0.35:
            self.state = "ESCAPING"
        elif self.velocity < -0.015:
            self.state = "REVERSING"
        elif abs(self.velocity) > 0.02:
            self.state = "MOVING"
        elif t > self.manual_until:
            self.state = "IDLE"

        drain = 0.0018 + abs(self.velocity) * 0.012
        self.energy = max(0.0, self.energy - drain)
        if self.energy <= 0:
            self.alive = False
            self.state = "OUT OF ENERGY"

        if world.predator_hit(self.x, self.y):
            self.alive = False
            self.energy = 0.0
            self.state = "CAUGHT"

        jac = jaccard_distance(self.previous_fired, fired)
        newly = np.setdiff1d(fired, self.previous_fired, assume_unique=False).size
        self.previous_fired = fired.copy()
        point = {"t": round(t, 3), "x": self.x, "y": self.y}
        self.trajectory.append(point)
        if len(self.trajectory) > 3000:
            self.trajectory = self.trajectory[-3000:]

        return self._frame(fired, motor, senses, float(trace.mean()) if trace.size else 0.0, assists, t, jac, newly)

    def _frame(
        self,
        fired,
        motor: dict,
        senses: dict,
        dn_activity: float,
        assists: dict,
        t: float,
        jac: float = 0.0,
        newly: int = 0,
    ) -> dict:
        fired_arr = np.asarray(fired, dtype=np.int64)
        dn_count = np.intersect1d(fired_arr, self.dn_idx, assume_unique=False).size if fired_arr.size else 0
        return {
            "id": self.id,
            "name": self.name,
            "is_prime": self.is_prime,
            "body_type": self.body_type,
            "controller": self.controller,
            "state": self.state,
            "alive": self.alive,
            "x": self.x,
            "y": self.y,
            "heading": self.heading,
            "speed": self.velocity,
            "energy": self.energy,
            "hunger": self.hunger,
            "food_eaten": self.food_eaten,
            "escape_events": self.escape_events,
            "fired_count": int(fired_arr.size),
            "firing_fraction": float(fired_arr.size / self.brain.n),
            "newly_firing": int(newly),
            "firing_jaccard_distance": jac,
            "dn_activity": dn_activity,
            "dn_fired": int(dn_count),
            "motor": motor,
            "senses": senses,
            "assists": assists,
            "trail": self.trajectory[-180:],
            "sampled_fired": fired_arr[:256].astype(int).tolist(),
            "brain_view": {
                "kind": self._brain_view_kind,
                "mapped": self._brain_mapped,
                "firing_positions": self._brain_firing_positions(fired_arr),
            },
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
