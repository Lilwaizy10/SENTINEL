"""
false_alarm_store.py — Spec Section 9.6
Stores and compares false alarm signatures for learning.
Over time the system builds a location-specific library of known false positive signatures.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import aiosqlite

from models import DB_PATH


async def record_false_alarm(
    incident_id: str,
    sound_type: str,
    sensor_id: str,
    embeddings: List[float],
    context: Optional[Dict] = None
) -> None:
    """
    Store YAMNet embedding vector tagged as false positive.
    Spec Section 9.6 — Layer 5: Negative Feedback Learning
    
    Args:
        incident_id: ID of the incident marked as false alarm
        sound_type: The classified sound type
        sensor_id: Sensor that reported the event
        embeddings: YAMNet embedding vector (521-dimensional)
        context: Optional context (time, zone, ambient_db, etc.)
    """
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            INSERT INTO false_alarm_signatures
            (id, incident_id, sound_type, sensor_id, embedding_json, context_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ''', (
            str(uuid.uuid4()),
            incident_id,
            sound_type,
            sensor_id,
            json.dumps(embeddings),
            json.dumps(context or {})
        ))
        await db.commit()


async def similarity_to_known_false_alarms(
    embeddings: List[float],
    sensor_id: str,
    sound_type: str,
    threshold: float = 0.92
) -> tuple:
    """
    Returns similarity score (0.0-1.0) to known false alarms.
    If > threshold similarity: suppress alert automatically.
    
    Args:
        embeddings: Current YAMNet embedding vector
        sensor_id: Sensor reporting the event
        sound_type: Classified sound type
    
    Returns:
        Tuple of (similarity_score, should_suppress)
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        # Get false alarms for this sensor and sound type
        cursor = await db.execute('''
            SELECT embedding_json, context_json, created_at
            FROM false_alarm_signatures
            WHERE sensor_id = ? AND sound_type = ?
            ORDER BY created_at DESC
            LIMIT 50
        ''', (sensor_id, sound_type))
        
        rows = await cursor.fetchall()
        
        if not rows:
            return 0.0, False
        
        max_similarity = 0.0
        
        for row in rows:
            stored_embedding = json.loads(row['embedding_json'])
            similarity = cosine_similarity(embeddings, stored_embedding)
            max_similarity = max(max_similarity, similarity)
        
        should_suppress = max_similarity > threshold
        return max_similarity, should_suppress


async def get_sensor_false_alarm_rate(
    sensor_id: str,
    window_hours: int = 24
) -> float:
    """
    Get false alarm rate for a specific sensor over a time window.
    Returns rate as false_alarms_per_hour.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('''
            SELECT COUNT(*) as count
            FROM false_alarm_signatures
            WHERE sensor_id = ?
            AND created_at >= datetime('now', ?)
        ''', (sensor_id, f'-{window_hours} hours'))
        
        row = await cursor.fetchone()
        count = row[0] if row else 0
        
        return count / window_hours


async def get_recent_false_alarms(
    sensor_id: str,
    window_hours: int = 2
) -> int:
    """Get count of recent false alarms for a sensor."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('''
            SELECT COUNT(*)
            FROM false_alarm_signatures
            WHERE sensor_id = ?
            AND created_at >= datetime('now', ?)
        ''', (sensor_id, f'-{window_hours} hours'))
        
        row = await cursor.fetchone()
        return row[0] if row else 0


async def list_false_alarm_patterns(
    sensor_id: Optional[str] = None,
    limit: int = 100
) -> List[Dict]:
    """List false alarm patterns, optionally filtered by sensor."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        if sensor_id:
            cursor = await db.execute('''
                SELECT id, incident_id, sound_type, sensor_id, context_json, created_at
                FROM false_alarm_signatures
                WHERE sensor_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            ''', (sensor_id, limit))
        else:
            cursor = await db.execute('''
                SELECT id, incident_id, sound_type, sensor_id, context_json, created_at
                FROM false_alarm_signatures
                ORDER BY created_at DESC
                LIMIT ?
            ''', (limit,))
        
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """
    Calculate cosine similarity between two vectors.
    Returns value between 0.0 (completely different) and 1.0 (identical).
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    
    dot_product = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    
    return dot_product / (norm_a * norm_b)


async def clear_old_false_alarms(days_old: int = 30) -> int:
    """
    Clear false alarm records older than specified days.
    Returns number of records deleted.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('''
            DELETE FROM false_alarm_signatures
            WHERE created_at < datetime('now', ?)
        ''', (f'-{days_old} days',))
        deleted = cursor.rowcount
        await db.commit()
        return deleted


async def get_false_alarm_hotspots() -> List[Dict]:
    """
    Identify sensors with high false alarm rates.
    Returns list of sensors with their false alarm counts.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        cursor = await db.execute('''
            SELECT sensor_id, sound_type, COUNT(*) as count,
                   MAX(created_at) as last_occurrence
            FROM false_alarm_signatures
            WHERE created_at >= datetime('now', '-7 days')
            GROUP BY sensor_id, sound_type
            HAVING count >= 3
            ORDER BY count DESC
        ''')
        
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


class FalseAlarmLearner:
    """
    Stateful learner that tracks and applies false alarm patterns.
    """
    
    SUPPRESSION_THRESHOLD = 0.92
    
    def __init__(self):
        self.cache: Dict[str, Dict] = {}
    
    async def check_and_record(
        self,
        incident_id: str,
        sound_type: str,
        sensor_id: str,
        embeddings: List[float],
        is_false_alarm: bool = False
    ) -> tuple:
        """
        Check similarity to known false alarms and optionally record new one.
        
        Returns:
            Tuple of (similarity_score, should_suppress)
        """
        similarity, should_suppress = await similarity_to_known_false_alarms(
            embeddings, sensor_id, sound_type, self.SUPPRESSION_THRESHOLD
        )
        
        if is_false_alarm:
            await record_false_alarm(incident_id, sound_type, sensor_id, embeddings)
            # Invalidate cache for this sensor
            cache_key = f"{sensor_id}:{sound_type}"
            if cache_key in self.cache:
                del self.cache[cache_key]
        
        return similarity, should_suppress
