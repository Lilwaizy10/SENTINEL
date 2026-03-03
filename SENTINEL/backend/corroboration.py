"""
corroboration.py — Spec Section 9.5
Multi-sensor corroboration for confidence boosting.
If multiple sensors detect the same event, confidence is significantly increased.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Dict
import math


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the great-circle distance between two points in meters.
    
    Args:
        lat1, lng1: Coordinates of first point
        lat2, lng2: Coordinates of second point
    
    Returns:
        Distance in meters
    """
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def check_corroboration(
    event: Dict,
    recent_events: List[Dict],
    radius_m: float = 30.0,
    time_window_s: float = 2.0
) -> float:
    """
    Check if other sensors corroborate this event.
    Spec Section 9.5 — Layer 4: Multi-Sensor Corroboration
    
    Args:
        event: The event to check (must have 'id', 'timestamp', 'location', 'sound_type')
        recent_events: List of recent events from other sensors
        radius_m: Maximum distance for corroboration (default 30m)
        time_window_s: Maximum time difference for corroboration (default 2s)
    
    Returns:
        Confidence multiplier: 1.25 (corroborated), 1.0 (no change), 0.90 (single sensor penalty)
    """
    try:
        event_time = datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00'))
    except (KeyError, ValueError):
        event_time = datetime.now()
    
    event_lat = event.get('lat') or (event.get('location', {}).get('lat') if isinstance(event.get('location'), dict) else 0)
    event_lng = event.get('lng') or (event.get('location', {}).get('lng') if isinstance(event.get('location'), dict) else 0)
    event_type = event.get('sound_type', event.get('type', ''))
    
    corroborating_count = 0
    
    for other in recent_events:
        # Skip same event
        if other.get('id') == event.get('id'):
            continue
        
        # Check sound type match
        other_type = other.get('sound_type', other.get('type', ''))
        if other_type != event_type:
            continue
        
        # Check time window
        try:
            other_time = datetime.fromisoformat(other['timestamp'].replace('Z', '+00:00'))
            time_diff = abs((event_time - other_time).total_seconds())
        except (KeyError, ValueError):
            continue
        
        if time_diff > time_window_s:
            continue
        
        # Check distance
        other_lat = other.get('lat') or (other.get('location', {}).get('lat') if isinstance(other.get('location'), dict) else 0)
        other_lng = other.get('lng') or (other.get('location', {}).get('lng') if isinstance(other.get('location'), dict) else 0)
        
        try:
            dist = haversine(event_lat, event_lng, other_lat, other_lng)
        except Exception:
            continue
        
        if dist <= radius_m:
            corroborating_count += 1
    
    # Return multiplier based on corroboration count
    if corroborating_count >= 2:
        return 1.50  # Strong corroboration (3+ sensors)
    elif corroborating_count >= 1:
        return 1.25  # Moderate corroboration (2 sensors)
    else:
        return 0.90  # Single sensor — slight penalty


def find_corroborating_sensors(
    event: Dict,
    recent_events: List[Dict],
    radius_m: float = 30.0,
    time_window_s: float = 2.0
) -> List[Dict]:
    """
    Find specific sensors that corroborate this event.
    Returns list of corroborating event details.
    """
    try:
        event_time = datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00'))
    except (KeyError, ValueError):
        event_time = datetime.now()
    
    event_lat = event.get('lat') or (event.get('location', {}).get('lat') if isinstance(event.get('location'), dict) else 0)
    event_lng = event.get('lng') or (event.get('location', {}).get('lng') if isinstance(event.get('location'), dict) else 0)
    event_type = event.get('sound_type', event.get('type', ''))
    
    corroborating = []
    
    for other in recent_events:
        if other.get('id') == event.get('id'):
            continue
        
        other_type = other.get('sound_type', other.get('type', ''))
        if other_type != event_type:
            continue
        
        try:
            other_time = datetime.fromisoformat(other['timestamp'].replace('Z', '+00:00'))
            time_diff = abs((event_time - other_time).total_seconds())
        except (KeyError, ValueError):
            continue
        
        if time_diff > time_window_s:
            continue
        
        other_lat = other.get('lat') or (other.get('location', {}).get('lat') if isinstance(other.get('location'), dict) else 0)
        other_lng = other.get('lng') or (other.get('location', {}).get('lng') if isinstance(other.get('location'), dict) else 0)
        
        try:
            dist = haversine(event_lat, event_lng, other_lat, other_lng)
        except Exception:
            continue
        
        if dist <= radius_m:
            corroborating.append({
                'id': other.get('id'),
                'sensor_id': other.get('sensor_id'),
                'distance_m': round(dist, 1),
                'time_diff_s': round(time_diff, 2),
                'confidence': other.get('confidence', 0)
            })
    
    return corroborating


def get_corroboration_label(multiplier: float) -> str:
    """Get human-readable label for corroboration status."""
    if multiplier >= 1.50:
        return "Strong Corroboration (3+ sensors)"
    elif multiplier >= 1.25:
        return "Corroborated (2 sensors)"
    elif multiplier >= 1.0:
        return "Single Sensor (No corroboration)"
    else:
        return "Isolated Detection (Unconfirmed)"


class CorroborationTracker:
    """
    Tracks events for corroboration checking.
    Maintains a rolling window of recent events.
    """
    
    def __init__(self, max_age_s: float = 10.0):
        self.events: List[Dict] = []
        self.max_age_s = max_age_s
    
    def add_event(self, event: Dict) -> None:
        """Add an event to the tracker."""
        self.events.append(event)
        self._cleanup()
    
    def _cleanup(self) -> None:
        """Remove events older than max_age."""
        now = datetime.now()
        self.events = [
            e for e in self.events
            if datetime.fromisoformat(e.get('timestamp', now.isoformat()).replace('Z', '+00:00')) 
            > now - timedelta(seconds=self.max_age_s)
        ]
    
    def check_event(self, event: Dict, radius_m: float = 30.0, time_window_s: float = 2.0) -> float:
        """Check corroboration for an event against tracked events."""
        return check_corroboration(event, self.events, radius_m, time_window_s)
    
    def get_corroborating(self, event: Dict, radius_m: float = 30.0, time_window_s: float = 2.0) -> List[Dict]:
        """Get list of corroborating events."""
        return find_corroborating_sensors(event, self.events, radius_m, time_window_s)
