from __future__ import annotations

import math
import numpy as np


class SensoryEncoder:
    """Experimental world -> documented FlyBrain sensory-population encoder."""

    def __init__(self, brain):
        self.brain = brain
        self.previous_size: dict[str, float] = {}
        self.last = {
            "food_odor": 0.0,
            "target": 0.0,
            "obstacle": 0.0,
            "loom": 0.0,
            "threat": 0.0,
            "touch": 0.0,
            "sound": 0.0,
            "light": 0.0,
        }
        self.orn = brain.cells(["ORN_DM1", "ORN_DM2"])
        self.visual = {
            "loom": {side: brain.cells(["LPLC2"], side=side) for side in ("L", "R")},
            "threat": {side: brain.cells(["LC4"], side=side) for side in ("L", "R")},
            "small": {side: brain.cells(["LPLC1"], side=side) for side in ("L", "R")},
            "target": {side: brain.cells(["LC10a"], side=side) for side in ("L", "R")},
        }
        self.touch = {side: brain.cells(["SNta"], side=side) for side in ("L", "R")}

        cell_types = np.asarray(getattr(brain, "cell_type", []), dtype=str)
        hearing_types = sorted({
            name for name in np.unique(cell_types)
            if name.startswith(("JO-A", "JO-B"))
        })
        self.hearing = brain.cells(hearing_types) if hearing_types else np.empty(0, dtype=np.int64)

    @staticmethod
    def _side(bearing: float) -> str:
        return "L" if bearing < 0 else "R"

    def encode(
        self,
        snapshot: dict,
        sensory_gain: float,
        hunger_gain: float,
        touch_side: str | None,
    ) -> tuple[list[tuple[np.ndarray, float]], np.ndarray | None, dict]:
        inject: list[tuple[np.ndarray, float]] = []
        current_sizes: dict[str, float] = {}
        display = {key: 0.0 for key in self.last}

        odor = max((item["drive"] for item in snapshot["food"]), default=0.0)
        if odor > 0 and len(self.orn):
            amount = float(np.clip(odor * sensory_gain * hunger_gain, 0, 0.8))
            inject.append((self.orn, amount))
            display["food_odor"] = amount

        for item in snapshot["visual"]:
            obj = item["object"]
            side = self._side(item["bearing"])
            size = float(item["angular_size"])
            current_sizes[obj.id] = size
            growth = max(0.0, size - self.previous_size.get(obj.id, size))

            if obj.kind in {"loom", "predator"}:
                loom = float(np.clip(growth * 10.0 + size * 0.08, 0, 0.8))
                if loom > 0 and len(self.visual["loom"][side]):
                    inject.append((self.visual["loom"][side], loom * sensory_gain))
                    display["loom"] = max(display["loom"], loom)
                threat = float(np.clip((0.18 - item["distance"]) * 5.0, 0, 0.8))
                if threat > 0 and len(self.visual["threat"][side]):
                    inject.append((self.visual["threat"][side], threat * sensory_gain))
                    display["threat"] = max(display["threat"], threat)
            elif obj.kind in {"stimulus", "goal", "food"}:
                target = float(np.clip(0.25 + size * 0.9, 0, 0.8))
                if len(self.visual["target"][side]):
                    inject.append((self.visual["target"][side], target * sensory_gain))
                    display["target"] = max(display["target"], target)

        for item in snapshot.get("obstacles", []):
            # A nearby frontal solid object is encoded as a small-object/approach
            # signal using LPLC1. This is an experimental visual encoder, not a
            # complete collision-avoidance circuit model.
            if abs(float(item["bearing"])) > 1.55:
                continue
            side = self._side(float(item["bearing"]))
            clearance = float(item.get("clearance", item["distance"]))
            size = float(item["angular_size"])
            approach = float(np.clip((0.24 - clearance) / 0.24, 0, 1))
            small_drive = float(np.clip(approach * 0.65 + size * 0.20, 0, 0.8))
            if small_drive > 0 and len(self.visual["small"][side]):
                inject.append((self.visual["small"][side], small_drive * sensory_gain))
                display["obstacle"] = max(display["obstacle"], small_drive)

        self.previous_size = current_sizes

        if touch_side and len(self.touch[touch_side]):
            inject.append((self.touch[touch_side], 0.55 * sensory_gain))
            display["touch"] = 0.55

        sound = max((item["drive"] for item in snapshot["sound"]), default=0.0)
        if sound > 0 and len(self.hearing):
            amount = float(np.clip(sound * sensory_gain, 0, 0.8))
            inject.append((self.hearing, amount))
            display["sound"] = amount

        eye_drive = self._eye_drive(snapshot, sensory_gain)
        if eye_drive is not None:
            display["light"] = float(np.max(eye_drive)) if eye_drive.size else 0.0

        self.last = display
        return inject, eye_drive, display

    def _eye_drive(self, snapshot: dict, sensory_gain: float) -> np.ndarray | None:
        visual_idx = getattr(self.brain, "visual", None)
        azimuth = getattr(self.brain, "azimuth", None)
        if visual_idx is None or azimuth is None or len(visual_idx) == 0:
            return None

        lights = [item for item in snapshot["visual"] if item["object"].kind == "light"]
        if not lights:
            return None

        az = np.asarray(azimuth, dtype=np.float32)
        drive = np.zeros(len(az), dtype=np.float32)
        for item in lights:
            center = float(np.clip(item["bearing"] / math.pi, -1, 1))
            width = float(np.clip(item["angular_size"] * 2.0, 0.03, 0.65))
            mask = np.abs(az - center) <= width
            drive[mask] = np.maximum(
                drive[mask],
                np.float32(np.clip(item["drive"] * sensory_gain, 0, 1)),
            )
        return drive


class MotorDecoder:
    """Named descending-neuron readout. Motion remains an explicit engineering decoder."""

    MOTOR_TYPES = {
        "forward": "DNg100",
        "steer": "DNa02",
        "escape": "DNp01",
        "backward": "MDN",
    }

    def __init__(self, brain):
        self.brain = brain
        self.groups: dict[str, np.ndarray] = {}
        for role, cell_type in self.MOTOR_TYPES.items():
            self.groups[role] = np.asarray(brain.cells([cell_type]), dtype=np.int64)
            self.groups[f"{role}_L"] = np.asarray(brain.cells([cell_type], side="L"), dtype=np.int64)
            self.groups[f"{role}_R"] = np.asarray(brain.cells([cell_type], side="R"), dtype=np.int64)
        self.smooth = {name: 0.0 for name in self.groups}

    def observe(self, fired: np.ndarray, dt: float) -> dict:
        fired = np.asarray(fired, dtype=np.int64)
        alpha = 0.28
        for name, idx in self.groups.items():
            count = np.intersect1d(fired, idx, assume_unique=False).size
            hz = count / max(1, len(idx)) / max(dt, 1e-6)
            self.smooth[name] += alpha * (float(hz) - self.smooth[name])
        return dict(self.smooth)

    def motion(self, signals: dict, controller: str = "lab") -> tuple[float, float, float]:
        steer_diff = signals["steer_L"] - signals["steer_R"]
        turn = float(np.clip(steer_diff * 0.09, -3.0, 3.0))

        forward_hz = max(0.0, signals["forward"] - 0.7)
        backward_hz = max(0.0, signals["backward"] - 0.7)
        neural_speed = float(np.clip((forward_hz - backward_hz) * 0.018, -0.14, 0.16))

        # PLAY adds a transparent embodied locomotion prior because this simplified
        # spiking connectome does not reliably relay ordinary sensory input into a
        # walking command. LAB removes that prior.
        base = 0.035 if controller == "play" else 0.0
        speed = float(np.clip(base + neural_speed, -0.14, 0.18))

        escape = float(np.clip((signals["escape"] - 2.0) / 16.0, 0, 1))
        if escape > 0:
            speed = max(speed, 0.08 + 0.12 * escape)
        return turn, speed, escape
