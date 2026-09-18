from __future__ import annotations

import os
import numpy as np


def run_batch_probe(
    population: str,
    amount: float = 0.8,
    steps: int = 50,
    replicates: int = 4,
    seed: int = 64,
) -> dict:
    """Run several independent FlyBrain states against one shared connectome.

    This uses FlyBrain's native batch dimension, so graph wiring is shared rather
    than loading one 25M-edge matrix per replicate.
    """
    if os.getenv("FLYLAB_MOCK", "0") == "1":
        raise RuntimeError("batched scientific probe requires the real FlyBrain backend")

    from flybrain import FlyBrain, Trace

    brain = FlyBrain(
        device=os.getenv("FLY_DEVICE", "auto"),
        seed=seed,
        batch=replicates,
        sensory_input=os.getenv("FLYLAB_NATIVE_SENSORY_RECURRENT", "0") == "1",
    )
    idx = np.asarray(brain.cells([population]), dtype=np.int64)
    if idx.size == 0:
        raise ValueError(f"unknown or empty population: {population}")

    trace = Trace(
        brain,
        types=["descending_neuron"],
        tau=0.1,
        aggregate="batch",
    )
    total_spikes = np.zeros(replicates, dtype=np.float64)
    dn_sum = np.zeros(replicates, dtype=np.float64)
    dn_peak = np.zeros(replicates, dtype=np.float64)

    for _ in range(steps):
        fired = brain.step(inject=[(idx, float(amount))])
        features = np.asarray(trace.observe(fired))
        counts = np.asarray([len(item) for item in fired], dtype=np.float64)
        total_spikes += counts
        per_rep_dn = features.mean(axis=0) if features.size else np.zeros(replicates)
        dn_sum += per_rep_dn
        dn_peak = np.maximum(dn_peak, per_rep_dn)

    duration = steps * float(brain.dt)
    rows = []
    for replicate in range(replicates):
        rows.append({
            "replicate": replicate,
            "mean_firing_per_step": float(total_spikes[replicate] / steps),
            "mean_firing_hz_total": float(total_spikes[replicate] / duration),
            "mean_dn_trace": float(dn_sum[replicate] / steps),
            "peak_dn_trace": float(dn_peak[replicate]),
        })

    return {
        "population": population,
        "population_neurons": int(idx.size),
        "amount": float(amount),
        "steps": int(steps),
        "dt": float(brain.dt),
        "duration": duration,
        "replicates": int(replicates),
        "seed": int(seed),
        "rows": rows,
        "summary": {
            "mean_firing_per_step": float(np.mean([row["mean_firing_per_step"] for row in rows])),
            "mean_dn_trace": float(np.mean([row["mean_dn_trace"] for row in rows])),
            "sd_dn_trace": float(np.std([row["mean_dn_trace"] for row in rows])),
        },
        "provenance": "Real FlyBrain batched simulation; population stimulation is an experimental intervention.",
    }
