from __future__ import annotations

import numpy as np


def jaccard_distance(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.int64)
    b = np.asarray(b, dtype=np.int64)
    if a.size == 0 and b.size == 0:
        return 0.0
    inter = np.intersect1d(a, b, assume_unique=False).size
    union = np.union1d(a, b).size
    return 1.0 - (inter / union if union else 1.0)


def wrap_angle(value: float) -> float:
    return float((value + np.pi) % (2 * np.pi) - np.pi)


def euclidean(a: tuple[float, float], b: tuple[float, float]) -> float:
    return float(np.hypot(a[0] - b[0], a[1] - b[1]))
