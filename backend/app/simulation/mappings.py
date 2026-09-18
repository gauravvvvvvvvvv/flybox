from __future__ import annotations

import numpy as np

SENSORY_TYPES = ["LC10a"]
LOOM_TYPES = ["LC4", "LPLC2"]


def build_sensory_injections(brain, targets: list[dict], sensory_gain: float = 1.0):
    injections: list[tuple[np.ndarray, float]] = []
    for target in targets:
        side = "L" if target["bearing"] < 0 else "R"
        cell_types = LOOM_TYPES if target["object"].kind == "loom" else SENSORY_TYPES
        idx = brain.cells(cell_types, side=side)
        if len(idx):
            injections.append((idx, float(target["drive"] * sensory_gain)))
    return injections


def experimental_motor_mapping(left_dn: float, right_dn: float, total_dn: float) -> tuple[float, float]:
    """Engineering decoder, not a biological motor ground truth."""
    turn = float(np.clip((right_dn - left_dn) * 9.0, -2.8, 2.8))
    forward = float(np.clip(0.03 + total_dn * 0.8, 0.015, 0.16))
    return turn, forward
