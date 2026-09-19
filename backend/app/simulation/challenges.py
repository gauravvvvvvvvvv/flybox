from __future__ import annotations

CHALLENGES = {
    "sandbox": {
        "name": "Playground",
        "description": "No objective. Build a world and poke the brains.",
        "goal": "sandbox",
    },
    "food_run": {
        "name": "Snack Attack",
        "description": "Get the agents to finish 3 food items.",
        "goal": "food",
        "target": 3,
    },
    "survive": {
        "name": "Don't Get Squished",
        "description": "Keep at least one fly alive for 60 simulated seconds.",
        "goal": "survive",
        "target": 60,
    },
    "hunt": {
        "name": "You vs Fly",
        "description": "Use HAND to drag the predator. The agent wins if it survives 30 seconds.",
        "goal": "survive",
        "target": 30,
    },
    "braincar": {
        "name": "Brain Car",
        "description": "Put the selected connectome in a car body and race to the goal.",
        "goal": "race",
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
    "maze": {
        "name": "Maze Run",
        "description": "Navigate the walls and take a bite from the fruit at the far end.",
        "goal": "first_food",
        "target": 1,
    },
    "tournament": {
        "name": "Mutation Tournament",
        "description": "Multiple agents share one arena. First to 5 bites wins.",
        "goal": "first_food",
        "target": 5,
    },
    "mystery": {
        "name": "Mystery Brain",
        "description": "One non-primary agent can receive a hidden reproducible intervention.",
        "goal": "mystery",
    },
    "history": {
        "name": "Recent History",
        "description": "Give two identical brain states different recent sensory histories, then compare them in the same neutral world.",
        "goal": "history",
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
