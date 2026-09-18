from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .models.schemas import InterventionIn, WorldObjectIn
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


app = FastAPI(title="FLY.LAB API", version="0.1.0", lifespan=lifespan)
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
async def add_fly(clone_prime: bool = False):
    try:
        return await get_engine().add_fly(clone_prime=clone_prime)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.delete("/api/flies/{fly_id}")
async def remove_fly(fly_id: str):
    try:
        await get_engine().remove_fly(fly_id)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/world")
async def add_world_object(obj: WorldObjectIn):
    return await get_engine().add_world_object(obj.model_dump())


@app.delete("/api/world/{object_id}")
async def remove_world_object(object_id: str):
    await get_engine().remove_world_object(object_id)
    return {"ok": True}


@app.delete("/api/world")
async def clear_world():
    await get_engine().clear_world()
    return {"ok": True}


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
    try:
        while True:
            sim = engine
            if sim is None:
                await ws.send_json({"type": "error", "message": "FlyBrain backend unavailable.", "error": startup_error})
                await asyncio.sleep(1)
                continue
            await ws.send_json(sim.frame_payload())
            await asyncio.sleep(1 / 20)
    except WebSocketDisconnect:
        return
