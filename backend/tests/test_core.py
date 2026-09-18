import os
os.environ["FLYLAB_MOCK"] = "1"

import asyncio
import numpy as np

from app.simulation.engine import SimulationEngine
from app.simulation.interventions import InterventionManager
from app.simulation.measurements import jaccard_distance
from app.simulation.mockbrain import MockBrain
from app.simulation.world import World


def test_jaccard_distance():
    assert jaccard_distance(np.array([1, 2]), np.array([1, 2])) == 0
    assert jaccard_distance(np.array([1]), np.array([2])) == 1


def test_world_boundary_is_deterministic():
    world = World(seed=1)
    assert world.collide_and_clamp(-1, 2, 0.5, 0.5) == (0.02, 0.98)


def test_seeded_random_lesion():
    first = MockBrain(seed=1)
    second = MockBrain(seed=1)
    a = InterventionManager(first)
    b = InterventionManager(second)
    spec = {"type": "random_synapse_lesion", "fraction": 0.1, "seed": 99}
    a.apply(spec, 0.0)
    b.apply(spec, 0.0)
    assert np.array_equal(first.weights, second.weights)


def test_intervention_serialization():
    brain = MockBrain(seed=2)
    mgr = InterventionManager(brain)
    mgr.apply({"type": "silence_population", "target": "LC4"}, 1.2)
    row = mgr.serialized()[0]
    assert row["target"] == "LC4"
    assert row["time"] == 1.2


def test_export_and_frame_schema():
    async def run():
        sim = SimulationEngine(seed=7)
        frame = await sim.step_once()
        assert frame["type"] == "frame"
        assert frame["flies"][0]["id"] == "prime"
        exported = sim.export_experiment()
        assert exported["format"] == "flybox-experiment-v1"
        assert exported["seed"] == 7
    asyncio.run(run())
