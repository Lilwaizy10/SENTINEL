"""
simulator.py — Enhanced
Smarter demo event generator with:
  - Weighted incident type probabilities
  - Burst mode (back-to-back events to trigger FP pipeline)
  - Time-of-day variation
  - Per-device cooldown to avoid duplicate spam
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from datetime import datetime, timezone


# ── Incident templates with weights ───────────────────────────────────────────
# Each entry: (type, severity, weight, lat, lng, location)

TEMPLATES = [
    # High-priority threats (lower weight = rarer, but more realistic)
    ("Gunshot, gunfire",  "CRITICAL", 5,  1.2814, 103.8636, "Marina Bay Sands, SG"),
    ("Explosion",         "CRITICAL", 3,  1.2494, 103.8303, "Sentosa Island, SG"),
    ("Screaming",         "HIGH",     12, 1.2993, 103.8554, "Bugis Junction, SG"),
    ("Fire",              "HIGH",     10, 1.3048, 103.8318, "Orchard Road, SG"),
    ("Glass break",       "MEDIUM",   15, 1.2839, 103.8517, "Raffles Place, SG"),
    ("Siren",             "MEDIUM",   8,  1.3000, 103.8400, "City Hall, SG"),
    ("Alarm",             "MEDIUM",   10, 1.2950, 103.8550, "Bras Basah, SG"),
    # Ambient / low priority (high weight = common, often FP)
    ("Speech",            "LOW",      30, 1.3521, 103.8198, "Generic Location, SG"),
    ("Music",             "LOW",      25, 1.3200, 103.8100, "Clarke Quay, SG"),
    ("Crowd",             "LOW",      20, 1.3010, 103.8480, "Esplanade, SG"),
]

WEIGHTS = [t[2] for t in TEMPLATES]

# Devices that can send events — simulate multiple Pi nodes
DEVICES = ["pi-north-01", "pi-south-02", "pi-east-03", "pi-central-04"]

# Per-device cooldown (seconds) to prevent duplicate floods
_device_last_sent: dict[str, float] = {}
DEVICE_COOLDOWN = 5.0


def _pick_event(device_id: str) -> dict:
    tpl = random.choices(TEMPLATES, weights=WEIGHTS, k=1)[0]
    event_type, severity, _, lat, lng, location = tpl

    # Add small jitter to coordinates
    lat += random.uniform(-0.002, 0.002)
    lng += random.uniform(-0.002, 0.002)

    confidence = round(random.uniform(0.45, 0.98), 3)

    return {
        "id": f"sim-{int(time.time() * 1000) % 1_000_000}",
        "type": event_type,
        "location": location,
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "severity": severity,
        "status": "pending",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "confidence": confidence,
        "device_id": device_id,
        "simulated": True,
    }


def _is_burst_hour() -> bool:
    """Simulate higher event frequency during 'night' hours (demo effect)."""
    hour = datetime.now().hour
    return hour >= 20 or hour < 6


async def event_generator(manager, base_interval: float = 6.0) -> None:
    """
    Background task: broadcast mock incidents over all WebSocket connections.

    Burst mode (active 20:00-06:00): sends 2-3 rapid events then pauses.
    Normal mode: one event every `base_interval` seconds.
    """
    await asyncio.sleep(2)  # brief startup delay

    while True:
        burst = _is_burst_hour()
        count = random.randint(2, 3) if burst else 1

        for _ in range(count):
            device_id = random.choice(DEVICES)
            now = time.time()

            # Respect per-device cooldown
            if now - _device_last_sent.get(device_id, 0) < DEVICE_COOLDOWN:
                continue

            event = _pick_event(device_id)
            _device_last_sent[device_id] = now

            await manager.broadcast(json.dumps(event))

            if count > 1:
                await asyncio.sleep(random.uniform(0.5, 1.5))  # intra-burst gap

        interval = base_interval * random.uniform(0.7, 1.4)
        await asyncio.sleep(interval)
