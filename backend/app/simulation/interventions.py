from __future__ import annotations

from dataclasses import asdict, dataclass
import numpy as np


@dataclass
class Intervention:
    type: str
    target: str | None
    time: float
    amount: float = 0.8
    fraction: float = 0.1
    seed: int = 64
    active: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


class InterventionManager:
    def __init__(self, brain):
        self.brain = brain
        self.items: list[Intervention] = []
        self.silenced: dict[str, np.ndarray] = {}
        self.pending_stimulation: list[tuple[np.ndarray, float]] = []
        self._lesions: list[tuple[np.ndarray, np.ndarray]] = []

    def population(self, target: str) -> np.ndarray:
        return np.asarray(self.brain.cells([target]), dtype=np.int64)

    def apply(self, spec: dict, t: float) -> Intervention:
        kind = spec["type"]
        target = spec.get("target")
        item = Intervention(
            kind,
            target,
            t,
            float(spec.get("amount", 0.8)),
            float(spec.get("fraction", 0.1)),
            int(spec.get("seed", 64)),
        )

        if kind == "stimulate_population":
            if not target:
                raise ValueError("target is required")
            idx = self.population(target)
            if idx.size == 0:
                raise ValueError(f"unknown or empty population: {target}")
            self.pending_stimulation.append((idx, item.amount))
            item.active = False
        elif kind == "silence_population":
            if not target:
                raise ValueError("target is required")
            idx = self.population(target)
            if idx.size == 0:
                raise ValueError(f"unknown or empty population: {target}")
            self.silenced[target] = idx
        elif kind == "restore_population":
            if not target:
                raise ValueError("target is required")
            self.silenced.pop(target, None)
            item.active = False
        elif kind == "random_synapse_lesion":
            rng = np.random.default_rng(item.seed)
            n = len(self.brain.weights)
            count = int(round(n * item.fraction))
            edge_idx = np.sort(rng.choice(n, size=count, replace=False))
            original = np.asarray(self.brain.weights[edge_idx]).copy()
            self.brain.weights[edge_idx] = 0
            self._lesions.append((edge_idx, original))
        else:
            raise ValueError(f"unsupported intervention: {kind}")

        self.items.append(item)
        return item

    def injections(self) -> list[tuple[np.ndarray, float]]:
        output = self.pending_stimulation
        self.pending_stimulation = []
        return output

    def filter_fired(self, fired: np.ndarray) -> np.ndarray:
        if not self.silenced:
            return fired
        blocked = np.concatenate(list(self.silenced.values()))
        filtered = fired[~np.isin(fired, blocked, assume_unique=False)]
        self.brain.fired = self.brain.xp.asarray(filtered)
        return filtered

    def serialized(self) -> list[dict]:
        return [item.to_dict() for item in self.items]
