from __future__ import annotations

import asyncio
import os
import re
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .models.schemas import BatchProbeIn, BrainCouplingIn, ConsoleIn, EnvironmentIn, InterventionIn, ManualDriveIn, RenameIn, WorldObjectIn
from .simulation.batch import run_batch_probe
from .simulation.challenges import CHALLENGES
from .simulation.engine import SimulationEngine


@dataclass
class SessionRuntime:
    engine: SimulationEngine
    runner_task: asyncio.Task
    clients: int = 0
    cleanup_task: asyncio.Task | None = None


_sessions: dict[str, SessionRuntime] = {}
_current_session: ContextVar[str | None] = ContextVar("flybox_session", default=None)
_SESSION_RE = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")
_SESSION_GRACE_SECONDS = float(os.getenv("FLYLAB_SESSION_GRACE_SECONDS", "8"))
_MAX_SESSIONS = int(os.getenv("FLYLAB_MAX_SESSIONS", "2"))


def _session_id(value: str | None) -> str:
    if value is None or not _SESSION_RE.fullmatch(value):
        raise HTTPException(400, "missing or invalid ephemeral FLYBOX session id")
    return value


def _destroy_session(session_id: str) -> None:
    runtime = _sessions.pop(session_id, None)
    if runtime is None:
        return
    if runtime.cleanup_task and runtime.cleanup_task is not asyncio.current_task():
        runtime.cleanup_task.cancel()
    runtime.runner_task.cancel()


async def _cleanup_session_later(session_id: str, runtime: SessionRuntime) -> None:
    await asyncio.sleep(_SESSION_GRACE_SECONDS)
    current = _sessions.get(session_id)
    if current is runtime and runtime.clients <= 0:
        _destroy_session(session_id)


def _runtime_for(session_id: str) -> SessionRuntime:
    session_id = _session_id(session_id)
    existing = _sessions.get(session_id)
    if existing is not None:
        if existing.cleanup_task:
            existing.cleanup_task.cancel()
            existing.cleanup_task = None
        return existing

    # Reclaim already-disconnected sandboxes first. There is intentionally no
    # persistence layer: an idle sandbox is disposable.
    for old_id, runtime in list(_sessions.items()):
        if runtime.clients <= 0:
            _destroy_session(old_id)

    if len(_sessions) >= _MAX_SESSIONS:
        raise HTTPException(503, "this FLYBOX worker is at its temporary sandbox limit; retry shortly")

    engine = SimulationEngine(seed=int(os.getenv("FLYLAB_SEED", "64")))
    runner = asyncio.get_running_loop().create_task(engine.run_loop())
    runtime = SessionRuntime(engine=engine, runner_task=runner)
    _sessions[session_id] = runtime
    return runtime


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    for session_id in list(_sessions):
        _destroy_session(session_id)


app = FastAPI(title="FLYBOX API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FLYLAB_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def bind_ephemeral_session(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        sid = request.headers.get("X-Flybox-Session") or request.query_params.get("sid")
        token = _current_session.set(sid)
        try:
            return await call_next(request)
        finally:
            _current_session.reset(token)
    return await call_next(request)


def get_engine() -> SimulationEngine:
    sid = _session_id(_current_session.get())
    return _runtime_for(sid).engine


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "session_mode": "ephemeral-per-page",
        "active_sandboxes": len(_sessions),
        "max_sandboxes_per_worker": _MAX_SESSIONS,
    }


@app.post("/api/session/close")
async def close_session():
    sid = _session_id(_current_session.get())
    _destroy_session(sid)
    return {"ok": True, "discarded": True}


@app.get("/api/state")
async def state():
    return get_engine().frame_payload()


@app.get("/api/metadata")
async def metadata():
    return get_engine().metadata()


@app.get("/api/brain/{fly_id}/sample")
async def brain_sample(fly_id: str):
    try:
        return get_engine().brain_view(fly_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/api/populations/{fly_id}")
async def populations(fly_id: str):
    try:
        return {"populations": get_engine().populations(fly_id)}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/simulation/pause")
async def pause():
    sim = get_engine()
    sim.running = False
    return {"running": False}


@app.post("/api/simulation/resume")
async def resume():
    sim = get_engine()
    sim.running = True
    return {"running": True}


@app.post("/api/simulation/step")
async def step():
    return await get_engine().step_once()


@app.post("/api/simulation/reset")
async def reset():
    await get_engine().reset()
    return get_engine().frame_payload()


@app.post("/api/simulation/speed/{value}")
async def speed(value: float):
    sim = get_engine()
    if value not in {0.05, 0.25, 1, 2, 5, 10}:
        raise HTTPException(400, "speed must be 0.05, 0.25, 1, 2, 5, or 10")
    sim.speed = value
    return {"speed": value}


@app.post("/api/flies")
async def add_fly(
    clone_prime: bool = False,
    name: str | None = None,
    body_type: str = "fly",
    controller: str | None = None,
):
    try:
        return await get_engine().add_fly(
            clone_prime=clone_prime,
            name=name,
            body_type=body_type,
            controller=controller,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/flies/{fly_id}/fork")
async def fork_fly(fly_id: str):
    try:
        return await get_engine().fork_fly(fly_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.delete("/api/flies/{fly_id}")
async def remove_fly(fly_id: str):
    try:
        await get_engine().remove_fly(fly_id)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/flies/{fly_id}/rename")
async def rename_fly(fly_id: str, payload: RenameIn):
    try:
        await get_engine().rename_fly(fly_id, payload.name)
        return {"ok": True, "name": payload.name}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/flies/{fly_id}/body/{body_type}")
async def set_body(fly_id: str, body_type: str):
    try:
        await get_engine().set_body(fly_id, body_type)
        return {"ok": True, "body_type": body_type}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/flies/{fly_id}/controller/{controller}")
async def set_controller(fly_id: str, controller: str):
    try:
        await get_engine().set_controller(fly_id, controller)
        return {"ok": True, "controller": controller}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/flies/{fly_id}/move")
async def move_fly(fly_id: str, x: float, y: float):
    try:
        await get_engine().move_fly(fly_id, x, y)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/flies/{fly_id}/drive")
async def drive(fly_id: str, payload: ManualDriveIn):
    try:
        await get_engine().manual_drive(fly_id, payload.turn, payload.throttle)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/world/environment")
async def set_environment(payload: EnvironmentIn):
    await get_engine().set_environment(payload.daylight, payload.wind_x, payload.wind_y)
    return get_engine().frame_payload()


@app.post("/api/world")
async def add_world_object(obj: WorldObjectIn):
    return await get_engine().add_world_object(obj.model_dump())


@app.post("/api/world/{object_id}/move")
async def move_world_object(object_id: str, x: float, y: float):
    try:
        await get_engine().move_world_object(object_id, x, y)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.delete("/api/world/{object_id}")
async def remove_world_object(object_id: str):
    await get_engine().remove_world_object(object_id)
    return {"ok": True}


@app.delete("/api/world")
async def clear_world():
    await get_engine().clear_world()
    return {"ok": True}


@app.post("/api/world/randomize")
async def randomize_world(seed: int | None = None):
    await get_engine().randomize_world(seed)
    return get_engine().frame_payload()


@app.post("/api/world/daily")
async def daily_world():
    seed = await get_engine().daily_world()
    return {"seed": seed, "frame": get_engine().frame_payload()}


@app.post("/api/flies/{fly_id}/interventions")
async def intervene(fly_id: str, spec: InterventionIn):
    try:
        return await get_engine().apply_intervention(fly_id, spec.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/flies/{fly_id}/sensory-gain/{gain}")
async def sensory_gain(fly_id: str, gain: float):
    try:
        await get_engine().set_sensory_gain(fly_id, gain)
        return {"gain": gain}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/batch/probe")
async def batch_probe(payload: BatchProbeIn):
    try:
        return await asyncio.to_thread(
            run_batch_probe,
            payload.population,
            payload.amount,
            payload.steps,
            payload.replicates,
            payload.seed,
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/couplings")
async def connect_brains(payload: BrainCouplingIn):
    try:
        return await get_engine().connect_brains(
            payload.source,
            payload.target,
            payload.population,
            payload.gain,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.delete("/api/couplings")
async def disconnect_brains():
    await get_engine().disconnect_brains()
    return {"ok": True}


@app.get("/api/challenges")
async def challenges():
    return {"challenges": CHALLENGES}


@app.post("/api/challenges/{challenge_id}")
async def start_challenge(challenge_id: str):
    try:
        await get_engine().start_challenge(challenge_id)
        return get_engine().challenge_state()
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/challenges/mystery/reveal")
async def reveal_mystery():
    return {"secret": get_engine().reveal_mystery()}


@app.post("/api/console")
async def console(payload: ConsoleIn):
    try:
        return await get_engine().console(payload.command)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/time/checkpoint")
async def create_checkpoint(label: str | None = None):
    try:
        return await get_engine().create_checkpoint(label)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/time/rewind")
async def rewind(checkpoint_id: str | None = None):
    try:
        return await get_engine().rewind(checkpoint_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/experiments/export")
async def export_experiment():
    return get_engine().export_experiment()


@app.post("/api/experiments/import")
async def import_experiment(payload: dict):
    try:
        await get_engine().import_experiment(payload)
        return get_engine().frame_payload()
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    sid = ws.query_params.get("sid")
    try:
        runtime = _runtime_for(_session_id(sid))
    except HTTPException as exc:
        await ws.send_json({"type": "error", "message": str(exc.detail)})
        await ws.close(code=1008)
        return
    except Exception as exc:
        await ws.send_json({"type": "error", "message": "FlyBrain backend unavailable.", "error": f"{type(exc).__name__}: {exc}"})
        await ws.close(code=1011)
        return

    runtime.clients += 1
    runtime.engine.active_clients += 1
    if runtime.cleanup_task:
        runtime.cleanup_task.cancel()
        runtime.cleanup_task = None

    try:
        while True:
            await ws.send_json(runtime.engine.frame_payload())
            await asyncio.sleep(1 / 20)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        runtime.clients = max(0, runtime.clients - 1)
        runtime.engine.active_clients = max(0, runtime.engine.active_clients - 1)
        if runtime.clients == 0 and _sessions.get(_session_id(sid)) is runtime:
            runtime.cleanup_task = asyncio.create_task(_cleanup_session_later(_session_id(sid), runtime))


static_dir = os.getenv("FLYLAB_STATIC_DIR")
if static_dir and os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
