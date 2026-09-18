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
    amount: float = 1.0
    vx: float = 0.0
    vy: float = 0.0
    label: str | None = None


@dataclass
class World:
    seed: int = 64
    objects: list[ArenaObject] = field(default_factory=list)
    daylight: float = 1.0
    wind_x: float = 0.0
    wind_y: float = 0.0

    def add(
        self,
        kind: str,
        x: float,
        y: float,
        intensity: float = 0.8,
        radius: float = 0.04,
        amount: float = 1.0,
        vx: float = 0.0,
        vy: float = 0.0,
        label: str | None = None,
    ) -> ArenaObject:
        obj = ArenaObject(
            str(uuid.uuid4())[:8],
            kind,
            float(x),
            float(y),
            float(intensity),
            float(radius),
            float(amount),
            float(vx),
            float(vy),
            label,
        )
        self.objects.append(obj)
        return obj

    def remove(self, object_id: str) -> None:
        self.objects = [obj for obj in self.objects if obj.id != object_id]

    def clear(self) -> None:
        self.objects.clear()

    def update(self, dt: float) -> None:
        for obj in self.objects:
            if obj.vx == 0 and obj.vy == 0:
                continue
            obj.x += obj.vx * dt
            obj.y += obj.vy * dt
            if obj.x < obj.radius or obj.x > 1 - obj.radius:
                obj.vx *= -1
                obj.x = min(1 - obj.radius, max(obj.radius, obj.x))
            if obj.y < obj.radius or obj.y > 1 - obj.radius:
                obj.vy *= -1
                obj.y = min(1 - obj.radius, max(obj.radius, obj.y))

    def relative(self, obj: ArenaObject, x: float, y: float, heading: float) -> dict:
        dx, dy = obj.x - x, obj.y - y
        distance = max(1e-4, math.hypot(dx, dy))
        bearing = wrap_angle(math.atan2(dy, dx) - heading)
        return {
            "object": obj,
            "distance": distance,
            "bearing": bearing,
            "angular_size": min(1.5, obj.radius / distance),
        }

    def sensory_snapshot(self, x: float, y: float, heading: float, t: float) -> dict:
        visual: list[dict] = []
        food: list[dict] = []
        sound: list[dict] = []
        obstacles: list[dict] = []
        for obj in self.objects:
            rel = self.relative(obj, x, y, heading)
            distance = rel["distance"]
            if obj.kind in {"food", "odor"}:
                # Concentration-like field. It is an experimental encoder rather than
                # a fluid/odor-plume simulation.
                rel["drive"] = min(0.8, obj.intensity * obj.amount / (0.12 + 5.0 * distance * distance))
                food.append(rel)
                # Food is also a small visible object; painted odor is not.
                if obj.kind == "food":
                    visual.append(rel)
            elif obj.kind in {"stimulus", "loom", "predator", "light", "goal"}:
                rel["drive"] = min(0.8, obj.intensity / (1.0 + 2.5 * distance))
                visual.append(rel)
            elif obj.kind == "sound":
                pulse = 0.5 + 0.5 * math.sin(2 * math.pi * max(0.25, obj.amount) * t)
                rel["drive"] = min(0.8, obj.intensity * pulse / (0.2 + 3.0 * distance))
                sound.append(rel)
            elif obj.kind == "obstacle":
                rel["clearance"] = max(0.0, distance - obj.radius)
                rel["drive"] = float(max(0.0, 1.0 - rel["clearance"] / 0.24))
                obstacles.append(rel)
        return {"visual": visual, "food": food, "sound": sound, "obstacles": obstacles}

    def bounce_bounds(
        self,
        x: float,
        y: float,
        heading: float,
        padding: float = 0.02,
    ) -> tuple[float, float, float, bool]:
        """Reflect an embodied agent off the arena boundary instead of pinning it there."""
        bounced = False
        if x < padding:
            x = padding + 0.002
            heading = math.pi - heading
            bounced = True
        elif x > 1.0 - padding:
            x = 1.0 - padding - 0.002
            heading = math.pi - heading
            bounced = True

        if y < padding:
            y = padding + 0.002
            heading = -heading
            bounced = True
        elif y > 1.0 - padding:
            y = 1.0 - padding - 0.002
            heading = -heading
            bounced = True

        return x, y, heading % (2 * math.pi), bounced

    def collide_and_clamp(
        self,
        x: float,
        y: float,
        old_x: float,
        old_y: float,
        heading: float,
    ) -> tuple[float, float, str | None]:
        x, y = min(0.98, max(0.02, x)), min(0.98, max(0.02, y))
        touch_side: str | None = None
        for obj in self.objects:
            if obj.kind != "obstacle":
                continue
            dx, dy = obj.x - x, obj.y - y
            if math.hypot(dx, dy) < obj.radius + 0.018:
                rel = wrap_angle(math.atan2(dy, dx) - heading)
                touch_side = "L" if rel < 0 else "R"
                return old_x, old_y, touch_side
        return x, y, touch_side

    def feed(self, x: float, y: float, bite: float = 0.004) -> tuple[bool, float, bool]:
        for obj in list(self.objects):
            if obj.kind != "food":
                continue
            if math.hypot(x - obj.x, y - obj.y) < obj.radius + 0.028:
                eaten = min(obj.amount, bite)
                obj.amount -= eaten
                finished = obj.amount <= 1e-6
                if finished:
                    self.objects.remove(obj)
                return True, eaten, finished
        return False, 0.0, False

    def predator_hit(self, x: float, y: float) -> bool:
        return any(
            obj.kind == "predator" and math.hypot(x - obj.x, y - obj.y) < obj.radius + 0.02
            for obj in self.objects
        )

    def goal_reached(self, x: float, y: float) -> bool:
        return any(
            obj.kind == "goal" and math.hypot(x - obj.x, y - obj.y) < obj.radius + 0.025
            for obj in self.objects
        )

    def nearest_food(self, x: float, y: float) -> ArenaObject | None:
        foods = [obj for obj in self.objects if obj.kind == "food"]
        if not foods:
            return None
        return min(foods, key=lambda obj: math.hypot(obj.x - x, obj.y - y))

    def to_dict(self) -> dict:
        return {
            "seed": self.seed,
            "daylight": self.daylight,
            "wind_x": self.wind_x,
            "wind_y": self.wind_y,
            "objects": [asdict(obj) for obj in self.objects],
        }
