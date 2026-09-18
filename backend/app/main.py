from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .models.schemas import BrainCouplingIn, ConsoleIn, InterventionIn, ManualDriveIn, RenameIn, ShareCodeIn, WorldObjectIn
from .simulation.challenges import CHALLENGES
from .simulation.engine import SimulationEngine

engine: SimulationEngine | None = None
startup_error: str | None = None
runner_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine, startup_error, runner_task
    try:
        engine = SimulationEngine(seed=int(os.getenv("FLYLAB_SEED", "64")))
        runner_task = asyncio.create_task(engine.run_loop())
    except Exception as exc:
        startup_error = f"{type(exc).__name__}: {exc}"
        engine = None
    yield
    if runner_task:
        runner_task.cancel()


app = FastAPI(title="FLYBOX API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FLYLAB_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_engine() -> SimulationEngine:
    if engine is None:
        raise HTTPException(
            status_code=503,
            detail={"message": "FlyBrain backend unavailable.", "error": startup_error},
        )
    return engine


@app.get("/api/health")
async def health():
    if engine is None:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "message": "FlyBrain backend unavailable.", "error": startup_error},
        )
    return {"ok": True, "mock": engine.mock, **engine.metadata()}


@app.get("/api/state")
async def state():
    return get_engine().frame_payload()


@app.get("/api/metadata")
async def metadata():
    return get_engine().metadata()


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
    if value not in {0.25, 1, 2, 5, 10}:
        raise HTTPException(400, "speed must be 0.25, 1, 2, 5, or 10")
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


@app.post("/api/flies/{fly_id}/drive")
async def drive(fly_id: str, payload: ManualDriveIn):
    try:
        await get_engine().manual_drive(fly_id, payload.turn, payload.throttle)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


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


@app.get("/api/share")
async def share_box():
    return {"code": get_engine().share_code()}


@app.post("/api/share/import")
async def import_share_box(payload: ShareCodeIn):
    try:
        await get_engine().import_share_code(payload.code)
        return get_engine().frame_payload()
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
    connected_engine = engine
    if connected_engine is not None:
        connected_engine.active_clients += 1
    try:
        while True:
            sim = engine
            if sim is None:
                await ws.send_json({
                    "type": "error",
                    "message": "FlyBrain backend unavailable.",
                    "error": startup_error,
                })
                await asyncio.sleep(1)
                continue
            await ws.send_json(sim.frame_payload())
            await asyncio.sleep(1 / 20)
    except WebSocketDisconnect:
        return
    finally:
        if connected_engine is not None:
            connected_engine.active_clients = max(0, connected_engine.active_clients - 1)


static_dir = os.getenv("FLYLAB_STATIC_DIR")
if static_dir and os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
