from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass


@dataclass
class Flybox:
    base_url: str = "http://localhost:8000"

    def _request(self, path: str, method: str = "GET", payload: dict | None = None):
        data = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(
            self.base_url.rstrip("/") + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"} if data is not None else {},
        )
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())

    def state(self):
        return self._request("/api/state")

    def resume(self):
        return self._request("/api/simulation/resume", "POST")

    def pause(self):
        return self._request("/api/simulation/pause", "POST")

    def step(self):
        return self._request("/api/simulation/step", "POST")

    def spawn(self, name: str | None = None, body: str = "fly"):
        suffix = f"?body_type={body}" + (f"&name={name}" if name else "")
        return self._request("/api/flies" + suffix, "POST")

    def stimulate(self, fly_id: str, population: str, amount: float = 0.8):
        return self._request(
            f"/api/flies/{fly_id}/interventions",
            "POST",
            {"type": "stimulate_population", "target": population, "amount": amount},
        )

    def silence(self, fly_id: str, population: str):
        return self._request(
            f"/api/flies/{fly_id}/interventions",
            "POST",
            {"type": "silence_population", "target": population},
        )

    def add(self, kind: str, x: float, y: float, **kwargs):
        return self._request("/api/world", "POST", {"kind": kind, "x": x, "y": y, **kwargs})

    def challenge(self, challenge_id: str):
        return self._request(f"/api/challenges/{challenge_id}", "POST")

    def console(self, command: str):
        return self._request("/api/console", "POST", {"command": command})

    def export(self):
        return self._request("/api/experiments/export")
