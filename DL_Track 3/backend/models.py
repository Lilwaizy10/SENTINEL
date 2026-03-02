"""
models.py — SENTINEL Data Models
Spec Section 5.4 — Incident Data Model (Pydantic)
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, List

import aiosqlite
from pydantic import BaseModel, Field

# ── Enums ─────────────────────────────────────────────────────────────────────

class SeverityLevel(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class IncidentStatus(str, Enum):
    OPEN = "OPEN"
    ACTIVE = "ACTIVE"
    DISPATCHED = "DISPATCHED"
    RESOLVED = "RESOLVED"


class VolunteerStatus(str, Enum):
    AVAILABLE = "available"
    NOTIFIED = "notified"
    ACCEPTED = "accepted"
    EN_ROUTE = "en_route"
    DECLINED = "declined"
    OFFLINE = "offline"


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class Location(BaseModel):
    """Spec Section 5.4 — Location schema"""
    lat: float
    lng: float
    zone: str
    description: Optional[str] = None


class IncidentCreate(BaseModel):
    """Spec Section 5.4 — Incident creation schema"""
    type: str  # sound_type: 'distress_scream' | 'glass_break' | 'gunshot' | etc.
    location: str
    lat: float
    lng: float
    zone: Optional[str] = None
    severity: SeverityLevel
    confidence: Optional[float] = None
    device_id: Optional[str] = None
    sensor_id: Optional[str] = None
    recommended_response: Optional[List[str]] = None


class Incident(BaseModel):
    """Spec Section 5.4 — Full Incident model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    location: str
    lat: float
    lng: float
    zone: Optional[str] = None
    type: str  # sound_type
    severity: SeverityLevel
    confidence: Optional[float] = None
    status: IncidentStatus = IncidentStatus.OPEN
    recommended_response: Optional[List[str]] = None
    volunteers_notified: int = 0
    assigned_volunteer_id: Optional[str] = None
    device_id: Optional[str] = None
    sensor_id: Optional[str] = None
    false_positive_score: Optional[float] = None
    fp_action: Optional[str] = None  # "AUTO_ALERT" | "HUMAN_REVIEW" | "LOG_ONLY" | "SUPPRESSED"

    model_config = {"from_attributes": True}


class VolunteerCreate(BaseModel):
    """Volunteer creation schema"""
    name: str
    lat: float
    lng: float
    phone: Optional[str] = None


class Volunteer(VolunteerCreate):
    """Full Volunteer model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: VolunteerStatus = VolunteerStatus.AVAILABLE
    distance_m: Optional[float] = None
    eta_minutes: Optional[int] = None

    model_config = {"from_attributes": True}


class ClassificationResult(BaseModel):
    """Spec Section 6.3 — Classification result schema"""
    label: str
    confidence: float
    top5: list[dict] = []
    mock: bool = False


class WebSocketEvent(BaseModel):
    """Spec Section 3.2 — WebSocket event envelope"""
    type: str  # "NEW_INCIDENT" | "VOLUNTEER_UPDATE" | "INCIDENT_UPDATE" | "STATS_UPDATE"
    payload: dict


# ── Database Layer ────────────────────────────────────────────────────────────

DB_PATH = "sentinel.db"


async def init_db() -> None:
    """Create tables if they don't exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                location TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                zone TEXT,
                severity TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'OPEN',
                timestamp TEXT NOT NULL,
                confidence REAL,
                device_id TEXT,
                sensor_id TEXT,
                recommended_response TEXT,
                volunteers_notified INTEGER DEFAULT 0,
                assigned_volunteer_id TEXT,
                false_positive_score REAL,
                fp_action TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS volunteers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                phone TEXT,
                status TEXT NOT NULL DEFAULT 'available',
                distance_m REAL,
                eta_minutes INTEGER
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS false_alarm_signatures (
                id TEXT PRIMARY KEY,
                incident_id TEXT,
                sound_type TEXT,
                sensor_id TEXT,
                embedding_json TEXT,
                context_json TEXT,
                created_at TEXT
            )
        """)
        await db.commit()
        
        # Seed demo volunteers if table is empty
        cursor = await db.execute("SELECT COUNT(*) FROM volunteers")
        (count,) = await cursor.fetchone()
        if count == 0:
            seed = [
                ("vol-001", "Alice Tan",  1.3048, 103.8318, "+6590000001", "available", 400, 2),
                ("vol-002", "Bob Lim",    1.2993, 103.8554, "+6590000002", "available", 1200, 5),
                ("vol-003", "Chloe Ng",   1.2839, 103.8517, "+6590000003", "offline", None, None),
                ("vol-004", "Ravi S.",    1.3521, 103.8198, "+6590000004", "available", 180, 2),
                ("vol-005", "Sarah Wong", 1.3343, 103.8490, "+6590000005", "available", 600, 3),
            ]
            await db.executemany(
                "INSERT INTO volunteers VALUES (?,?,?,?,?,?,?,?)", seed
            )
            await db.commit()


async def save_incident(incident: Incident) -> None:
    """Save or update an incident in the database."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT OR REPLACE INTO incidents
               VALUES (:id,:type,:location,:lat,:lng,:zone,:severity,:status,
                       :timestamp,:confidence,:device_id,:sensor_id,
                       :recommended_response,:volunteers_notified,
                       :assigned_volunteer_id,:false_positive_score,:fp_action)""",
            {
                **incident.model_dump(),
                "timestamp": incident.timestamp.isoformat(),
                "recommended_response": incident.recommended_response and ",".join(incident.recommended_response),
            },
        )
        await db.commit()


async def get_incident(incident_id: str) -> Optional[dict]:
    """Get a single incident by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def get_incidents(limit: int = 50) -> list[dict]:
    """Get incidents ordered by timestamp descending."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM incidents ORDER BY timestamp DESC LIMIT ?", (limit,)
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_volunteers() -> list[dict]:
    """Get all volunteers."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM volunteers")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_volunteer(volunteer_id: str) -> Optional[dict]:
    """Get a single volunteer by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM volunteers WHERE id = ?", (volunteer_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def update_volunteer_status(volunteer_id: str, status: str) -> None:
    """Update volunteer status."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE volunteers SET status=? WHERE id=?", (status, volunteer_id)
        )
        await db.commit()


async def update_incident_status(incident_id: str, status: str) -> None:
    """Update incident status."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE incidents SET status=? WHERE id=?", (status, incident_id)
        )
        await db.commit()


async def assign_volunteer(incident_id: str, volunteer_id: str) -> None:
    """Assign a volunteer to an incident."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE incidents SET assigned_volunteer_id=?, status='DISPATCHED' WHERE id=?",
            (volunteer_id, incident_id),
        )
        await db.execute(
            "UPDATE volunteers SET status='en_route' WHERE id=?",
            (volunteer_id,),
        )
        await db.commit()


async def record_false_alarm(incident_id: str, sound_type: str, sensor_id: str, embeddings: list) -> None:
    """Record a false alarm signature for learning (Spec Section 9.6)."""
    import json
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO false_alarm_signatures 
               (id, incident_id, sound_type, sensor_id, embedding_json, created_at)
               VALUES (?, ?, ?, ?, ?, datetime('now'))""",
            (str(uuid.uuid4()), incident_id, sound_type, sensor_id, json.dumps(embeddings))
        )
        await db.commit()
