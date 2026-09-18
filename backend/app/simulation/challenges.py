from __future__ import annotations

CHALLENGES = {
    "sandbox": {
        "name": "Playground",
        "description": "No objective. Build a world and poke the brains.",
        "goal": "sandbox",
    },
    "food_run": {
        "name": "Snack Attack",
        "description": "Get any fly to eat 3 food items.",
        "goal": "food",
        "target": 3,
    },
    "survive": {
        "name": "Don't Get Squished",
        "description": "Keep at least one fly alive for 60 simulated seconds.",
        "goal": "survive",
        "target": 60,
    },
    "hijack": {
        "name": "Connectome Hijack",
        "description": "Reach high descending-neuron activity using at most 5 manual stimulations.",
        "goal": "dn_activity",
        "target": 0.12,
        "budget": 5,
    },
    "race": {
        "name": "Fly Race",
        "description": "First agent to the glowing target wins.",
        "goal": "race",
    },
    "mystery": {
        "name": "Mystery Brain",
        "description": "One non-primary agent can receive a hidden reproducible intervention.",
        "goal": "mystery",
    },
}

ACHIEVEMENTS = {
    "first_bite": ("FIRST BITE", "A fly ate food."),
    "escape_artist": ("ESCAPE ARTIST", "Triggered a strong DNp01 escape response."),
    "brain_surgeon": ("BRAIN SURGEON", "Applied a neural intervention."),
    "chaos_theory": ("CHAOS THEORY", "Applied a seeded random lesion."),
    "party_box": ("PARTY BOX", "Ran at least three agents together."),
    "why_did_you_do_that": ("WHY DID YOU DO THAT", "Dropped an agent below 25 energy."),
    "survivor": ("SURVIVOR", "Kept an agent alive for 60 simulated seconds."),
}
