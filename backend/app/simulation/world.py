from __future__ import annotations

from dataclasses import asdict, dataclass, field
import math
import uuid

from .measurements import wrap_angle


@dataclass
class ArenaObject:
    id: str
    kind: str
    x: float
    y: float
    intensity: float = 0.8
    radius: float = 0.04


@dataclass
class World:
    seed: int = 64
    objects: list[ArenaObject] = field(default_factory=list)

    def add(self, kind: str, x: float, y: float, intensity: float = 0.8, radius: float = 0.04) -> ArenaObject:
        obj = ArenaObject(str(uuid.uuid4())[:8], kind, float(x), float(y), float(intensity), float(radius))
        self.objects.append(obj)
        return obj

    def remove(self, object_id: str) -> None:
        self.objects = [obj for obj in self.objects if obj.id != object_id]

    def clear(self) -> None:
        self.objects.clear()

    def sensory_targets(self, x: float, y: float, heading: float) -> list[dict]:
        output: list[dict] = []
        for obj in self.objects:
            if obj.kind not in {"stimulus", "loom"}:
                continue
            dx, dy = obj.x - x, obj.y - y
            distance = max(1e-3, math.hypot(dx, dy))
            bearing = wrap_angle(math.atan2(dy, dx) - heading)
            drive = min(1.0, obj.intensity / (1.0 + 3.0 * distance))
            output.append({"object": obj, "distance": distance, "bearing": bearing, "drive": drive})
        return output

    def collide_and_clamp(self, x: float, y: float, old_x: float, old_y: float) -> tuple[float, float]:
        x, y = min(0.98, max(0.02, x)), min(0.98, max(0.02, y))
        for obj in self.objects:
            if obj.kind == "obstacle" and math.hypot(x - obj.x, y - obj.y) < obj.radius + 0.018:
                return old_x, old_y
        return x, y

    def consume_food(self, x: float, y: float) -> bool:
        for index, obj in enumerate(self.objects):
            if obj.kind == "food" and math.hypot(x - obj.x, y - obj.y) < obj.radius + 0.025:
                self.objects.pop(index)
                return True
        return False

    def to_dict(self) -> dict:
        return {"seed": self.seed, "objects": [asdict(obj) for obj in self.objects]}
