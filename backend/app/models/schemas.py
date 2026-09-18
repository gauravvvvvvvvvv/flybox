from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class WorldObjectIn(BaseModel):
    kind: Literal["food", "stimulus", "obstacle", "loom"]
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    intensity: float = Field(default=0.8, ge=0.0, le=2.0)
    radius: float = Field(default=0.04, ge=0.005, le=0.25)


class InterventionIn(BaseModel):
    type: Literal[
        "stimulate_population",
        "silence_population",
        "restore_population",
        "random_synapse_lesion",
    ]
    target: str | None = None
    amount: float = 0.8
    fraction: float = Field(default=0.1, ge=0.0, le=0.5)
    seed: int = 64


class Command(BaseModel):
    action: str
    payload: dict[str, Any] = Field(default_factory=dict)
