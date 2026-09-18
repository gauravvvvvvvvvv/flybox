import os
os.environ["FLYLAB_MOCK"] = "1"

import asyncio
import numpy as np

from app.simulation.engine import SimulationEngine
from app.simulation.interventions import InterventionManager
from app.simulation.mappings import MotorDecoder, SensoryEncoder
from app.simulation.measurements import jaccard_distance
from app.simulation.mockbrain import MockBrain
from app.simulation.world import World


def test_jaccard_distance():
    assert jaccard_distance(np.array([1, 2]), np.array([1, 2])) == 0
    assert jaccard_distance(np.array([1]), np.array([2])) == 1


def test_world_boundary_is_deterministic():
    world = World(seed=1)
    x, y, touch = world.collide_and_clamp(-1, 2, 0.5, 0.5, 0.0)
    assert (x, y) == (0.02, 0.98)
    assert touch is None


def test_food_emits_odor_and_sound_pulses():
    world = World(seed=1)
    world.add("food", 0.5, 0.5, intensity=1.0)
    world.add("sound", 0.7, 0.5, intensity=1.0, amount=3.0)
    snapshot = world.sensory_snapshot(0.4, 0.5, 0.0, 0.1)
    assert snapshot["food"][0]["drive"] > 0
    assert snapshot["sound"][0]["drive"] >= 0


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


def test_multisensory_encoder_targets_real_named_populations():
    brain = MockBrain(seed=2)
    enc = SensoryEncoder(brain)
    world = World(seed=1)
    world.add("food", 0.6, 0.5, intensity=1.0)
    world.add("loom", 0.8, 0.5, intensity=1.0)
    world.add("sound", 0.2, 0.5, intensity=1.0, amount=4)
    snap = world.sensory_snapshot(0.5, 0.5, 0.0, 0.2)
    inject, _, senses = enc.encode(snap, 1.0, 1.0, "L")
    assert inject
    assert senses["food_odor"] > 0
    assert senses["sound"] >= 0
    assert senses["touch"] > 0


def test_named_motor_decoder_has_expected_groups():
    brain = MockBrain(seed=3)
    decoder = MotorDecoder(brain)
    assert len(decoder.groups["forward"]) > 0
    assert len(decoder.groups["steer_L"]) > 0
    assert len(decoder.groups["escape"]) > 0
    assert len(decoder.groups["backward"]) > 0


def test_export_frame_challenge_and_exact_mock_fork():
    async def run():
        sim = SimulationEngine(seed=7)
        frame = await sim.step_once()
        assert frame["type"] == "frame"
        assert frame["flies"][0]["id"] == "prime"
        assert "motor" in frame["flies"][0]
        assert "senses" in frame["flies"][0]

        await sim.start_challenge("food_run")
        assert sim.challenge_state()["id"] == "food_run"

        fork = await sim.fork_fly("prime")
        assert fork["exact"] is True
        assert len(sim.flies) == 2

        exported = sim.export_experiment()
        assert exported["format"] == "flybox-experiment-v2"
        assert exported["seed"] == 7

    asyncio.run(run())


def test_random_world_is_seeded():
    async def run():
        a = SimulationEngine(seed=1)
        b = SimulationEngine(seed=1)
        await a.randomize_world(123)
        await b.randomize_world(123)
        aa = [(o.kind, round(o.x, 6), round(o.y, 6), round(o.radius, 6)) for o in a.world.objects]
        bb = [(o.kind, round(o.x, 6), round(o.y, 6), round(o.radius, 6)) for o in b.world.objects]
        assert aa == bb

    asyncio.run(run())


def test_brain_coupling_is_explicit_and_local():
    async def run():
        sim = SimulationEngine(seed=11)
        await sim.add_fly(name="BETA")
        target = next(k for k in sim.flies if k != "prime")
        link = await sim.connect_brains("prime", target, "LC10a", 0.7)
        assert link["kind"] == "experimental_artificial_coupling"
        assert link["source"] == "prime"
        assert link["target"] == target

    asyncio.run(run())


def test_exact_mock_checkpoint_rewind():
    async def run():
        sim = SimulationEngine(seed=21)
        await sim.step_once()
        cp = await sim.create_checkpoint("before")
        before = (sim.t, sim.flies["prime"].x, sim.flies["prime"].y, sim.flies["prime"].previous_fired.copy())
        for _ in range(4):
            await sim.step_once()
        assert sim.t > before[0]
        await sim.rewind(cp["id"])
        assert sim.t == before[0]
        assert sim.flies["prime"].x == before[1]
        assert sim.flies["prime"].y == before[2]
        assert np.array_equal(sim.flies["prime"].previous_fired, before[3])

    asyncio.run(run())
