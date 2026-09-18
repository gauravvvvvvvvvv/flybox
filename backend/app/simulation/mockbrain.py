from __future__ import annotations

import numpy as np


class MockBrain:
    dt = 0.020

    def __init__(self, seed: int = 64):
        self.n = 166_700
        self.batch = 1
        self.xp = np
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.device = "cpu"
        self.cell_type = np.array(["other"] * self.n, dtype=object)
        self.side = np.where(np.arange(self.n) % 2 == 0, "L", "R")
        self.superclass = np.array(["other"] * self.n, dtype=object)
        self.visual = np.arange(6006, dtype=np.int64)
        self.azimuth = np.linspace(-1, 1, len(self.visual), dtype=np.float32)

        cursor = 6006
        specs = [
            ("LC4", 126),
            ("LPLC2", 185),
            ("LPLC1", 170),
            ("LC10a", 275),
            ("LC6", 124),
            ("LC16", 182),
            ("LC15", 126),
            ("ORN_DM1", 80),
            ("ORN_DM2", 80),
            ("SNta", 120),
            ("JO-A1", 120),
            ("JO-B1", 120),
            ("DNg100", 28),
            ("DNa02", 24),
            ("DNp01", 20),
            ("MDN", 16),
        ]
        for name, count in specs:
            self.cell_type[cursor:cursor + count] = name
            cursor += count

        self.superclass[cursor:cursor + 1314] = "descending_neuron"
        # Named DNs are also descending neurons.
        for name in ("DNg100", "DNa02", "DNp01", "MDN"):
            self.superclass[self.cell_type == name] = "descending_neuron"

        self.weights = np.ones(100_000, dtype=np.float32)
        self.fired = np.empty(0, dtype=np.int64)

    def reset(self, seed: int | None = None):
        self.rng = np.random.default_rng(self.seed if seed is None else seed)
        self.fired = np.empty(0, dtype=np.int64)

    def cells(self, types: list[str], side: str | None = None):
        mask = np.isin(self.cell_type, types) | np.isin(self.superclass, types)
        if side:
            mask &= self.side == side
        return np.flatnonzero(mask)

    def step(self, inject=(), eye_drive=None):
        base = self.rng.choice(self.n, size=9_000, replace=False)
        forced: list[np.ndarray] = []
        for idx, amount in inject:
            idx = np.asarray(idx, dtype=np.int64)
            if len(idx) and np.any(np.asarray(amount) > 0):
                probability = float(np.clip(np.mean(amount), 0, 1))
                take = max(1, int(len(idx) * probability))
                forced.append(idx[:take])
        if eye_drive is not None and np.max(eye_drive) > 0:
            active = self.visual[np.asarray(eye_drive) > 0.35]
            forced.append(active[:1000])
        if forced:
            base = np.unique(np.concatenate([base, *forced]))
        self.fired = base
        return base


class MockTrace:
    def __init__(self, brain, types=None, idx=None, tau=0.1, aggregate="mean", **kwargs):
        self.idx = np.asarray(idx if idx is not None else brain.cells(types or []), dtype=np.int64)
        self.trace = np.zeros(len(self.idx), dtype=np.float32)
        self.slot = np.full(brain.n, -1, dtype=np.int64)
        self.slot[self.idx] = np.arange(len(self.idx))
        self.decay = np.float32(np.exp(-brain.dt / tau))

    def observe(self, fired):
        self.trace *= self.decay
        slots = self.slot[np.asarray(fired, dtype=np.int64)]
        slots = slots[slots >= 0]
        self.trace[slots] += 1
        return self.trace.copy()

    def reset(self):
        self.trace[...] = 0
