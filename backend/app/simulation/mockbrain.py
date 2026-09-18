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
        self.cell_type = np.array(["other"] * self.n, dtype=object)
        self.side = np.where(np.arange(self.n) % 2 == 0, "L", "R")
        self.superclass = np.array(["other"] * self.n, dtype=object)
        groups = {
            "LC4": (0, 126),
            "LPLC2": (126, 311),
            "LC10a": (311, 586),
            "LC6": (586, 710),
            "LC16": (710, 892),
            "LC15": (892, 1018),
            "descending_neuron": (1018, 2332),
        }
        for name, (start, end) in groups.items():
            if name == "descending_neuron":
                self.superclass[start:end] = name
            else:
                self.cell_type[start:end] = name
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
        base = self.rng.choice(self.n, size=10_000, replace=False)
        forced: list[np.ndarray] = []
        for idx, amount in inject:
            if amount > 0:
                forced.append(np.asarray(idx, dtype=np.int64))
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
