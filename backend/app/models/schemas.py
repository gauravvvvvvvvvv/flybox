from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


WorldKind = Literal[
    "food",
    "odor",
    "stimulus",
    "obstacle",
    "loom",
    "sound",
    "predator",
    "light",
    "goal",
]


class WorldObjectIn(BaseModel):
    kind: WorldKind
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    intensity: float = Field(default=0.8, ge=0.0, le=2.0)
    radius: float = Field(default=0.04, ge=0.005, le=0.25)
    amount: float = Field(default=1.0, ge=0.0, le=20.0)
    vx: float = Field(default=0.0, ge=-1.0, le=1.0)
    vy: float = Field(default=0.0, ge=-1.0, le=1.0)
    label: str | None = Field(default=None, max_length=40)


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


class ManualDriveIn(BaseModel):
    turn: float = Field(ge=-1.0, le=1.0)
    throttle: float = Field(ge=-1.0, le=1.0)


class RenameIn(BaseModel):
    name: str = Field(min_length=1, max_length=28)


class ConsoleIn(BaseModel):
    command: str = Field(min_length=1, max_length=200)


class ShareCodeIn(BaseModel):
    code: str = Field(min_length=1, max_length=200_000)


class BrainCouplingIn(BaseModel):
    source: str
    target: str
    population: str = "LC10a"
    gain: float = Field(default=0.5, ge=0.0, le=10.0)


class EnvironmentIn(BaseModel):
    daylight: float = Field(default=1.0, ge=0.0, le=1.0)
    wind_x: float = Field(default=0.0, ge=-0.5, le=0.5)
    wind_y: float = Field(default=0.0, ge=-0.5, le=0.5)


class BatchProbeIn(BaseModel):
    population: str
    amount: float = Field(default=0.8, ge=0.0, le=2.0)
    steps: int = Field(default=50, ge=5, le=250)
    replicates: int = Field(default=4, ge=1, le=8)
    seed: int = 64


class Command(BaseModel):
    action: str
    payload: dict[str, Any] = Field(default_factory=dict)
