"""
main.py — Enhanced
FastAPI application with:
  - Full REST API (incidents CRUD, volunteers, stats)
  - WebSocket broadcast manager
  - Section 9 False Positive Reduction pipeline integration
  - Async SQLite via aiosqlite
  - Auto-volunteer assignment on dispatch
"""

from __future__ import annotations

import asyncio
import json
import math
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    Incident,
    IncidentCreate,
    Volunteer,
    VolunteerCreate,
    SeverityLevel,
    init_db,
    save_incident,
    get_incidents,
    get_volunteers,
    update_volunteer_status,
    assign_volunteer,
)
from logic import EventWindow, AudioEvent, AlertRouter, make_pipeline
from simulator import event_generator

# Import classifier router
from classifier import router as classifier_router


# ── WebSocket Connection Manager ──────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: str) -> None:
        dead: list[WebSocket] = []
        for ws in list(self.active):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()

# ── Per-device FP pipeline instances ─────────────────────────────────────────
# Each Pi device gets its own sliding EventWindow + AlertRouter
_device_pipelines: dict[str, tuple[EventWindow, AlertRouter]] = {}


def _get_pipeline(device_id: str) -> tuple[EventWindow, AlertRouter]:
    if device_id not in _device_pipelines:
        _device_pipelines[device_id] = make_pipeline(window_seconds=12)
    return _device_pipelines[device_id]


# ── Volunteer assignment helper ───────────────────────────────────────────────

def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _try_assign_volunteer(incident: Incident) -> str | None:
    """Find and assign the nearest available volunteer. Returns volunteer_id or None."""
    volunteers_raw = await get_volunteers()
    available = [v for v in volunteers_raw if v["status"] == "available"]
    if not available:
        return None

    nearest = min(
        available,
        key=lambda v: _haversine(v["lat"], v["lng"], incident.lat, incident.lng),
    )
    await assign_volunteer(incident.id, nearest["id"])
    return nearest["id"]


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    sim_task = asyncio.create_task(event_generator(manager))
    yield
    sim_task.cancel()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SENTINEL API",
    description="Real-time incident detection and volunteer coordination",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(classifier_router)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ws_connections": len(manager.active),
    }


# ── Incidents ─────────────────────────────────────────────────────────────────

@app.get("/incidents", tags=["Incidents"])
async def list_incidents(limit: int = 50):
    return await get_incidents(limit=limit)


@app.post("/incidents", response_model=Incident, status_code=201, tags=["Incidents"])
async def create_incident(payload: IncidentCreate):
    """
    Ingest a new incident (from Pi sensor or manual entry).
    Runs the Section 9 FP pipeline before persisting.
    """
    device_id = payload.device_id or "unknown"
    window, router = _get_pipeline(device_id)

    # Feed into FP window
    if payload.confidence is not None:
        window.add(AudioEvent(label=payload.type, confidence=payload.confidence))

    decision = router.evaluate(window)

    incident = Incident(
        **payload.model_dump(),
        false_positive_score=decision["fp_score"],
        fp_action=decision["action"],
    )

    # Only persist & broadcast non-suppressed incidents
    if decision["action"] == "suppress":
        return incident  # return but don't save or alert

    await save_incident(incident)

    # Auto-assign volunteer for high/critical dispatches
    if decision["action"] == "dispatch" and incident.severity in (
        SeverityLevel.HIGH, SeverityLevel.CRITICAL
    ):
        vol_id = await _try_assign_volunteer(incident)
        if vol_id:
            incident.assigned_volunteer_id = vol_id
            await save_incident(incident)  # update with assignment

    # Broadcast to all WebSocket clients
    await manager.broadcast(
        json.dumps({
            **incident.model_dump(),
            "timestamp": incident.timestamp.isoformat(),
            "fp_decision": decision,
        })
    )

    return incident


@app.patch("/incidents/{incident_id}/resolve", tags=["Incidents"])
async def resolve_incident(incident_id: str):
    """Mark an incident as resolved and free the assigned volunteer."""
    incidents = await get_incidents(limit=500)
    inc = next((i for i in incidents if i["id"] == incident_id), None)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    if inc.get("assigned_volunteer_id"):
        await update_volunteer_status(inc["assigned_volunteer_id"], "available")

    # Broadcast resolution event
    await manager.broadcast(
        json.dumps({"event": "resolved", "incident_id": incident_id})
    )
    return {"status": "resolved", "incident_id": incident_id}


# ── Volunteers ────────────────────────────────────────────────────────────────

@app.get("/volunteers", tags=["Volunteers"])
async def list_volunteers():
    return await get_volunteers()


@app.get("/volunteers/{volunteer_id}", tags=["Volunteers"])
async def get_volunteer(volunteer_id: str):
    volunteers = await get_volunteers()
    vol = next((v for v in volunteers if v["id"] == volunteer_id), None)
    if not vol:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    return vol


@app.patch("/volunteers/{volunteer_id}/status", tags=["Volunteers"])
async def set_volunteer_status(volunteer_id: str, status: str):
    allowed = {"available", "dispatched", "offline"}
    if status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {allowed}")
    await update_volunteer_status(volunteer_id, status)
    return {"volunteer_id": volunteer_id, "status": status}


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.get("/stats", tags=["System"])
async def stats():
    incidents = await get_incidents(limit=500)
    volunteers = await get_volunteers()

    severity_counts: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    suppressed = 0

    for inc in incidents:
        severity_counts[inc["severity"]] = severity_counts.get(inc["severity"], 0) + 1
        status_counts[inc["status"]] = status_counts.get(inc["status"], 0) + 1
        if inc.get("fp_action") == "suppress":
            suppressed += 1

    return {
        "total_incidents": len(incidents),
        "suppressed_fp": suppressed,
        "by_severity": severity_counts,
        "by_status": status_counts,
        "volunteers": {
            "total": len(volunteers),
            "available": sum(1 for v in volunteers if v["status"] == "available"),
            "dispatched": sum(1 for v in volunteers if v["status"] == "dispatched"),
        },
        "active_ws_connections": len(manager.active),
    }


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    Real-time WebSocket channel.
    Clients receive JSON incident objects as they are created/updated.
    Clients may send pings (any text) to keep the connection alive.
    """
    await manager.connect(ws)
    # Send the last 20 incidents immediately on connect
    recent = await get_incidents(limit=20)
    for inc in reversed(recent):
        try:
            await ws.send_text(json.dumps(inc))
        except Exception:
            break

    try:
        while True:
            await ws.receive_text()  # drain client pings
    except WebSocketDisconnect:
        manager.disconnect(ws)
