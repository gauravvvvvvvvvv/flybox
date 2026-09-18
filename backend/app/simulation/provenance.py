PROVENANCE = {
    "connectome": {
        "label": "CONNECTOME DATA",
        "description": "Cell types, sides, graph weights and named populations come from FlyBrain/MaleCNS metadata.",
    },
    "neural": {
        "label": "SIMULATED NEURAL DYNAMICS",
        "description": "Spikes and traces are produced by FlyBrain's leaky integrate-and-fire simulation.",
    },
    "encoder": {
        "label": "EXPERIMENTAL ENCODER",
        "description": "World objects are converted into voltage injections for documented sensory populations.",
    },
    "decoder": {
        "label": "EXPERIMENTAL DECODER",
        "description": "Named descending-neuron activity is converted into body motion by an explicit engineering mapping.",
    },
    "game": {
        "label": "GAME MECHANIC",
        "description": "Energy, hunger, scores, assisted foraging, bodies, challenges and achievements are sandbox mechanics.",
    },
}

SENSORY_PROVENANCE = {
    "food": {
        "populations": ["ORN_DM1", "ORN_DM2"],
        "basis": "FlyBrain upstream examples use ORN_DM1/ORN_DM2 as fruit-ester olfactory receptor populations.",
        "kind": "encoder",
    },
    "target": {
        "populations": ["LC10a"],
        "basis": "FlyBrain FeatureDetectors uses LC10a as a target/chase visual channel.",
        "kind": "encoder",
    },
    "loom": {
        "populations": ["LPLC2"],
        "basis": "FlyBrain FeatureDetectors uses LPLC2 for looming.",
        "kind": "encoder",
    },
    "threat": {
        "populations": ["LC4"],
        "basis": "FlyBrain FeatureDetectors uses LC4 for close/fast threat input.",
        "kind": "encoder",
    },
    "small": {
        "populations": ["LPLC1"],
        "basis": "FlyBrain FeatureDetectors uses LPLC1 for small approaching objects.",
        "kind": "encoder",
    },
    "touch": {
        "populations": ["SNta"],
        "basis": "FlyBrain embodied examples use SNta for tarsal touch.",
        "kind": "encoder",
    },
    "sound": {
        "populations": ["JO-A*", "JO-B*"],
        "basis": "FlyBrain examples use Johnston's-organ JO-A/JO-B populations as auditory input.",
        "kind": "encoder",
    },
}

MOTOR_PROVENANCE = {
    "forward": {"populations": ["DNg100"], "kind": "decoder"},
    "steer": {"populations": ["DNa02"], "kind": "decoder"},
    "escape": {"populations": ["DNp01"], "kind": "decoder"},
    "backward": {"populations": ["MDN"], "kind": "decoder"},
}
