"""
models.py — Enhanced
Real async SQLite persistence (aiosqlite) + typed Pydantic v2 models.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

import aiosqlite
from pydantic import BaseModel, Field

# ── Enums ─────────────────────────────────────────────────────────────────────

class SeverityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class IncidentStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    DISPATCHED = "dispatched"
    RESOLVED = "resolved"


class VolunteerStatus(str, Enum):
    AVAILABLE = "available"
    DISPATCHED = "dispatched"
    OFFLINE = "offline"


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class IncidentCreate(BaseModel):
    type: str
    location: str
    lat: float
    lng: float
    severity: SeverityLevel
    confidence: Optional[float] = None
    device_id: Optional[str] = None


class Incident(IncidentCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: IncidentStatus = IncidentStatus.PENDING
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    assigned_volunteer_id: Optional[str] = None
    false_positive_score: Optional[float] = None
    fp_action: Optional[str] = None  # "dispatch" | "monitor" | "suppress"

    model_config = {"from_attributes": True}


class VolunteerCreate(BaseModel):
    name: str
    lat: float
    lng: float
    phone: Optional[str] = None


class Volunteer(VolunteerCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: VolunteerStatus = VolunteerStatus.AVAILABLE

    model_config = {"from_attributes": True}


class ClassificationResult(BaseModel):
    label: str
    confidence: float
    top5: list[dict] = []
    mock: bool = False


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
                severity TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                timestamp TEXT NOT NULL,
                confidence REAL,
                device_id TEXT,
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
                status TEXT NOT NULL DEFAULT 'available'
            )
        """)
        await db.commit()
        # Seed demo volunteers if table is empty
        cursor = await db.execute("SELECT COUNT(*) FROM volunteers")
        (count,) = await cursor.fetchone()
        if count == 0:
            seed = [
                ("vol-001", "Alice Tan",  1.3048, 103.8318, "+6590000001", "available"),
                ("vol-002", "Bob Lim",    1.2993, 103.8554, "+6590000002", "available"),
                ("vol-003", "Chloe Ng",   1.2839, 103.8517, "+6590000003", "offline"),
            ]
            await db.executemany(
                "INSERT INTO volunteers VALUES (?,?,?,?,?,?)", seed
            )
            await db.commit()


async def save_incident(incident: Incident) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT OR REPLACE INTO incidents
               VALUES (:id,:type,:location,:lat,:lng,:severity,:status,
                       :timestamp,:confidence,:device_id,
                       :assigned_volunteer_id,:false_positive_score,:fp_action)""",
            {
                **incident.model_dump(),
                "timestamp": incident.timestamp.isoformat(),
            },
        )
        await db.commit()


async def get_incidents(limit: int = 50) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM incidents ORDER BY timestamp DESC LIMIT ?", (limit,)
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_volunteers() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM volunteers")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def update_volunteer_status(volunteer_id: str, status: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE volunteers SET status=? WHERE id=?", (status, volunteer_id)
        )
        await db.commit()


async def assign_volunteer(incident_id: str, volunteer_id: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE incidents SET assigned_volunteer_id=?, status='dispatched' WHERE id=?",
            (volunteer_id, incident_id),
        )
        await db.execute(
            "UPDATE volunteers SET status='dispatched' WHERE id=?",
            (volunteer_id,),
        )
        await db.commit()
