from __future__ import annotations

import asyncio
import os
import re
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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


app = FastAPI(\n    title="FLYBOX API",\n    version="0.2.0",\n    lifespan=lifespan,\n    docs_url="/api/docs",\n    redoc_url="/api/redoc",\n    openapi_url="/api/openapi.json",\n)
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


async def _ws_api(engine: SimulationEngine, method: str, raw_path: str, body: dict | None):
    body = body or {}
    parsed = urlsplit(raw_path)
    path = parsed.path
    query = parse_qs(parsed.query)

    def first(name: str, default=None):
        values = query.get(name)
        return values[0] if values else default

    if method == "GET":
        if path == "/api/state":
            return engine.frame_payload()
        if path == "/api/metadata":
            return engine.metadata()
        if path == "/api/challenges":
            return {"challenges": CHALLENGES}
        if path == "/api/experiments/export":
            return engine.export_experiment()

        match = re.fullmatch(r"/api/brain/([^/]+)/sample", path)
        if match:
            return engine.brain_view(match.group(1))

        match = re.fullmatch(r"/api/populations/([^/]+)", path)
        if match:
            return {"populations": engine.populations(match.group(1))}

    if method == "POST":
        if path == "/api/simulation/pause":
            engine.running = False
            return {"running": False}
        if path == "/api/simulation/resume":
            engine.running = True
            return {"running": True}
        if path == "/api/simulation/step":
            return await engine.step_once()
        if path == "/api/simulation/reset":
            await engine.reset()
            return engine.frame_payload()

        match = re.fullmatch(r"/api/simulation/speed/([0-9.]+)", path)
        if match:
            value = float(match.group(1))
            if value not in {0.05, 0.25, 1, 2, 5, 10}:
                raise ValueError("speed must be 0.05, 0.25, 1, 2, 5, or 10")
            engine.speed = value
            return {"speed": value}

        if path == "/api/flies":
            clone_prime = str(first("clone_prime", "false")).lower() == "true"
            return await engine.add_fly(
                clone_prime=clone_prime,
                name=first("name"),
                body_type=first("body_type", "fly"),
                controller=first("controller"),
            )

        match = re.fullmatch(r"/api/flies/([^/]+)/fork", path)
        if match:
            return await engine.fork_fly(match.group(1))

        match = re.fullmatch(r"/api/flies/([^/]+)/rename", path)
        if match:
            await engine.rename_fly(match.group(1), str(body.get("name", "")))
            return {"ok": True}

        match = re.fullmatch(r"/api/flies/([^/]+)/body/([^/]+)", path)
        if match:
            await engine.set_body(match.group(1), match.group(2))
            return {"ok": True, "body_type": match.group(2)}

        match = re.fullmatch(r"/api/flies/([^/]+)/controller/([^/]+)", path)
        if match:
            await engine.set_controller(match.group(1), match.group(2))
            return {"ok": True, "controller": match.group(2)}

        match = re.fullmatch(r"/api/flies/([^/]+)/move", path)
        if match:
            await engine.move_fly(match.group(1), float(first("x")), float(first("y")))
            return {"ok": True}

        match = re.fullmatch(r"/api/flies/([^/]+)/drive", path)
        if match:
            await engine.manual_drive(match.group(1), float(body.get("turn", 0)), float(body.get("throttle", 0)))
            return {"ok": True}

        match = re.fullmatch(r"/api/flies/([^/]+)/interventions", path)
        if match:
            return await engine.apply_intervention(match.group(1), body)

        match = re.fullmatch(r"/api/flies/([^/]+)/sensory-gain/([0-9.]+)", path)
        if match:
            gain = float(match.group(2))
            await engine.set_sensory_gain(match.group(1), gain)
            return {"gain": gain}

        if path == "/api/world/environment":
            await engine.set_environment(
                float(body.get("daylight", 1)),
                float(body.get("wind_x", 0)),
                float(body.get("wind_y", 0)),
            )
            return engine.frame_payload()

        if path == "/api/world":
            return await engine.add_world_object(body)

        match = re.fullmatch(r"/api/world/([^/]+)/move", path)
        if match:
            await engine.move_world_object(match.group(1), float(first("x")), float(first("y")))
            return {"ok": True}

        if path == "/api/world/randomize":
            seed = first("seed")
            await engine.randomize_world(None if seed is None else int(seed))
            return engine.frame_payload()

        if path == "/api/world/daily":
            seed = await engine.daily_world()
            return {"seed": seed, "frame": engine.frame_payload()}

        if path == "/api/couplings":
            return await engine.connect_brains(
                str(body["source"]),
                str(body["target"]),
                str(body.get("population", "LC10a")),
                float(body.get("gain", 0.5)),
            )

        if path == "/api/challenges/mystery/reveal":
            return {"secret": engine.reveal_mystery()}

        match = re.fullmatch(r"/api/challenges/([^/]+)", path)
        if match:
            await engine.start_challenge(match.group(1))
            return engine.challenge_state()

        if path == "/api/console":
            return await engine.console(str(body.get("command", "")))

        if path == "/api/time/checkpoint":
            return await engine.create_checkpoint(first("label"))

        if path == "/api/time/rewind":
            return await engine.rewind(first("checkpoint_id"))

        if path == "/api/experiments/import":
            await engine.import_experiment(body)
            return engine.frame_payload()

    if method == "DELETE":
        if path == "/api/world":
            await engine.clear_world()
            return {"ok": True}
        if path == "/api/couplings":
            await engine.disconnect_brains()
            return {"ok": True}

        match = re.fullmatch(r"/api/world/([^/]+)", path)
        if match:
            await engine.remove_world_object(match.group(1))
            return {"ok": True}

        match = re.fullmatch(r"/api/flies/([^/]+)", path)
        if match:
            await engine.remove_fly(match.group(1))
            return {"ok": True}

    raise ValueError(f"unsupported websocket API route: {method} {raw_path}")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    sid = ws.query_params.get("sid")
    explicit_close = False
    try:
        runtime = _runtime_for(_session_id(sid))
    except HTTPException as exc:
        await ws.send_json({"type": "error", "message": str(exc.detail)})
        await ws.close(code=1008)
        return
    except Exception as exc:
        await ws.send_json({
            "type": "error",
            "message": "FlyBrain backend unavailable.",
            "error": f"{type(exc).__name__}: {exc}",
        })
        await ws.close(code=1011)
        return

    runtime.clients += 1
    runtime.engine.active_clients += 1
    if runtime.cleanup_task:
        runtime.cleanup_task.cancel()
        runtime.cleanup_task = None

    try:
        while True:
            try:
                message = await asyncio.wait_for(ws.receive_json(), timeout=1 / 20)
            except asyncio.TimeoutError:
                message = None

            if message:
                message_type = message.get("type")
                if message_type == "close":
                    explicit_close = True
                    break
                if message_type == "rpc":
                    rpc_id = message.get("id")
                    try:
                        data = await _ws_api(
                            runtime.engine,
                            str(message.get("method", "GET")).upper(),
                            str(message.get("path", "")),
                            message.get("body"),
                        )
                        await ws.send_json({
                            "type": "rpc_result",
                            "id": rpc_id,
                            "ok": True,
                            "data": data,
                        })
                    except Exception as exc:
                        await ws.send_json({
                            "type": "rpc_result",
                            "id": rpc_id,
                            "ok": False,
                            "error": str(exc),
                        })

            await ws.send_json(runtime.engine.frame_payload())
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        runtime.clients = max(0, runtime.clients - 1)
        runtime.engine.active_clients = max(0, runtime.engine.active_clients - 1)
        valid_sid = _session_id(sid)
        if explicit_close:
            _destroy_session(valid_sid)
        elif runtime.clients == 0 and _sessions.get(valid_sid) is runtime:
            runtime.cleanup_task = asyncio.create_task(
                _cleanup_session_later(valid_sid, runtime)
            )


static_dir = os.getenv("FLYLAB_STATIC_DIR")
if static_dir and os.path.isdir(static_dir):
    @app.get("/docs", include_in_schema=False)
    @app.get("/docs/", include_in_schema=False)
    @app.get("/docs/{doc_path:path}", include_in_schema=False)
    @app.get("/help", include_in_schema=False)
    @app.get("/help/", include_in_schema=False)
    @app.get("/help/{doc_path:path}", include_in_schema=False)
    async def docs_page(doc_path: str = ""):
        return FileResponse(os.path.join(static_dir, "index.html"))

    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
