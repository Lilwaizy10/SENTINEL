"""
simulator.py — SENTINEL Demo Event Generator
Spec Section 5.6 — Fires fake incidents for demo
Generates realistic sensor events across Singapore HDB zones
"""

from __future__ import annotations

import asyncio
import json
import random
import uuid
import time
from datetime import datetime, timezone

# ── Singapore HDB Zones (Spec Section 5.6) ────────────────────────────────────

ZONES = [
    {'zone': 'Bedok North', 'lat': 1.3245, 'lng': 103.9301, 'description': 'Void Deck Block 123'},
    {'zone': 'Tampines Central', 'lat': 1.3530, 'lng': 103.9440, 'description': 'HDB Corridor'},
    {'zone': 'Toa Payoh', 'lat': 1.3343, 'lng': 103.8490, 'description': 'Void Deck Block 56'},
    {'zone': 'Jurong East', 'lat': 1.3331, 'lng': 103.7420, 'description': 'HDB Walkway'},
    {'zone': 'Woodlands', 'lat': 1.4365, 'lng': 103.7864, 'description': 'Void Deck Block 88'},
    {'zone': 'Ang Mo Kio', 'lat': 1.3691, 'lng': 103.8454, 'description': 'HDB Corridor'},
    {'zone': 'Hougang', 'lat': 1.3712, 'lng': 103.8923, 'description': 'Void Deck Block 201'},
    {'zone': 'Sengkang', 'lat': 1.3868, 'lng': 103.8914, 'description': 'HDB Walkway'},
]

# ── Sound Types with Severity (Spec Section 5.5) ──────────────────────────────

SOUND_SEVERITY_MAP = {
    'gunshot': 'CRITICAL',
    'explosion': 'CRITICAL',
    'distress_scream': 'HIGH',
    'glass_break': 'HIGH',
    'screaming': 'HIGH',
    'siren': 'HIGH',
    'impact_thud': 'MEDIUM',
    'alarm': 'MEDIUM',
    'distress_cry': 'MEDIUM',
    'crowd_noise': 'LOW',
    'car_alarm': 'LOW',
    'speech': 'LOW',
    'music': 'LOW',
}

RESPONSE_MAP = {
    'CRITICAL': ['Police (999)', 'SCDF (995)', 'SGSecure'],
    'HIGH':     ['SCDF (995)', 'SGSecure'],
    'MEDIUM':   ['SGSecure'],
    'LOW':      ['Dispatcher Review']
}

# Weighted sound selection (higher weight = more common)
SOUNDS_WEIGHTS = {
    'distress_scream': 15,
    'glass_break': 12,
    'impact_thud': 10,
    'screaming': 10,
    'gunshot': 3,
    'explosion': 2,
    'siren': 8,
    'alarm': 8,
    'distress_cry': 6,
    'crowd_noise': 20,
    'car_alarm': 15,
    'speech': 25,
    'music': 20,
}

# ── Sensor Devices ────────────────────────────────────────────────────────────

DEVICES = [
    {"id": "pi-north-01", "zone": "Bedok North", "lat": 1.3245, "lng": 103.9301},
    {"id": "pi-south-02", "zone": "Tampines Central", "lat": 1.3530, "lng": 103.9440},
    {"id": "pi-east-03", "zone": "Toa Payoh", "lat": 1.3343, "lng": 103.8490},
    {"id": "pi-west-04", "zone": "Jurong East", "lat": 1.3331, "lng": 103.7420},
    {"id": "pi-central-05", "zone": "Woodlands", "lat": 1.4365, "lng": 103.7864},
]

_device_last_sent: dict[str, float] = {}
DEVICE_COOLDOWN = 5.0


def _generate_incident(device: dict = None) -> dict:
    """Generate a realistic incident event (Spec Section 5.6)."""
    if device is None:
        device = random.choice(DEVICES)
    
    # Pick sound type based on weights
    sound = random.choices(
        list(SOUNDS_WEIGHTS.keys()),
        weights=list(SOUNDS_WEIGHTS.values()),
        k=1
    )[0]
    
    # Add small jitter to coordinates
    lat = device['lat'] + random.uniform(-0.002, 0.002)
    lng = device['lng'] + random.uniform(-0.002, 0.002)
    
    # Generate confidence based on sound type
    base_confidence = random.uniform(0.70, 0.97)
    
    return {
        "id": f"inc_{uuid.uuid4().hex[:6]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": sound,
        "location": device.get('description', f"{device['zone']} HDB"),
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "zone": device['zone'],
        "severity": SOUND_SEVERITY_MAP.get(sound, 'LOW'),
        "confidence": round(base_confidence, 2),
        "recommended_response": RESPONSE_MAP.get(SOUND_SEVERITY_MAP.get(sound, 'LOW'), []),
        "status": "OPEN",
        "sensor_id": device['id'],
        "device_id": device['id'],
        "volunteers_notified": 0,
        "simulated": True,
    }


def _is_burst_hour() -> bool:
    """Simulate higher event frequency during 'night' hours (demo effect)."""
    hour = datetime.now().hour
    return hour >= 20 or hour < 6


async def event_generator(manager, base_interval: float = 8.0) -> None:
    """
    Background task: broadcast mock incidents over all WebSocket connections.
    Spec Section 5.6 — Demo Event Generator
    
    Burst mode (active 20:00-06:00): sends 2-3 rapid events then pauses.
    Normal mode: one event every `base_interval` seconds.
    """
    await asyncio.sleep(2)  # brief startup delay

    while True:
        burst = _is_burst_hour()
        count = random.randint(2, 3) if burst else 1

        for _ in range(count):
            device = random.choice(DEVICES)
            now = time.time()

            # Respect per-device cooldown
            if now - _device_last_sent.get(device['id'], 0) < DEVICE_COOLDOWN:
                continue

            event = _generate_incident(device)
            _device_last_sent[device['id']] = now

            # Broadcast via WebSocket with proper event format (Spec Section 3.2)
            await manager.broadcast({
                "type": "NEW_INCIDENT",
                "payload": event
            })

            if count > 1:
                await asyncio.sleep(random.uniform(0.5, 1.5))  # intra-burst gap

        interval = base_interval * random.uniform(0.7, 1.4)
        await asyncio.sleep(interval)


# Standalone runner for testing
async def main():
    """Run simulator standalone for testing."""
    class MockManager:
        async def broadcast(self, msg: dict):
            print(json.dumps(msg, indent=2))
    
    manager = MockManager()
    print("Starting SENTINEL Simulator...")
    print("Events will fire every 8-20 seconds")
    await event_generator(manager, base_interval=10.0)


if __name__ == "__main__":
    asyncio.run(main())
