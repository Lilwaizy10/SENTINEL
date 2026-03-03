"""
context_scorer.py — Spec Section 9.4
Applies contextual weighting rules based on time and zone.
The same sound carries different risk depending on when and where it occurs.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional


# Zone type definitions for Singapore context
ZONE_TYPES = {
    # Residential zones (HDB, condos)
    'residential': ['Bedok', 'Tampines', 'Toa Payoh', 'Jurong East', 
                    'Woodlands', 'Ang Mo Kio', 'Hougang', 'Sengkang', 
                    'Punggol', 'Yishun', 'Choa Chu Kang', 'Bukit Batok'],
    
    # Commercial/entertainment zones
    'commercial': ['Orchard', 'Raffles Place', 'Marina Bay', 'Bugis', 
                   'Clarke Quay', 'Boat Quay', 'Chinatown'],
    
    # Educational zones
    'educational': ['Kent Ridge', 'Buona Vista', 'Clementi', 
                    'Bishan', 'Serangoon'],
    
    # Hawker/food zones
    'hawker': ['Maxwell', 'Lau Pa Sat', 'Old Airport Road', 
               'Tiong Bahru', 'Newton', 'Geylang Serai'],
    
    # Industrial zones
    'industrial': ['Tuas', 'Joo Koon', 'Defu', 'Tai Seng', 'Ubi'],
}


def get_zone_type(zone_name: str) -> str:
    """Determine zone type from zone name."""
    zone_lower = zone_name.lower()
    
    for zone_type, keywords in ZONE_TYPES.items():
        if any(kw.lower() in zone_lower for kw in keywords):
            return zone_type
    
    # Default to residential for HDB-heavy Singapore
    return 'residential'


def apply_context_weight(
    confidence: float,
    zone_type: str = 'residential',
    sensor_id: str = '',
    recent_false_alarms: int = 0,
    ambient_db: float = 0.0,
    hour: Optional[int] = None
) -> float:
    """
    Apply contextual weighting to confidence score.
    Spec Section 9.4 — Layer 3: Time and Zone Context Rules
    
    Args:
        confidence: Base confidence score (0.0-1.0)
        zone_type: Type of zone (residential, commercial, hawker, etc.)
        sensor_id: Sensor identifier for tracking false alarm history
        recent_false_alarms: Number of false alarms from this sensor in last 2 hours
        ambient_db: Current ambient noise level in dB
        hour: Hour of day (0-23) in Singapore time. If None, uses current time.
    
    Returns:
        Context-adjusted confidence score (0.0-1.0)
    """
    if hour is None:
        hour = datetime.now().hour  # Local Singapore time (SGT = UTC+8)
    
    weight = 0.0
    
    # ── Time of day adjustments ───────────────────────────────────────
    # Late night (23:00-06:00) — higher concern for any disturbance
    if hour >= 23 or hour < 6:
        weight += 0.15  # late night — higher concern
    
    # Daytime in noisy zones — lower concern
    elif zone_type in ['hawker', 'commercial', 'educational'] and 7 <= hour <= 21:
        weight -= 0.10  # noisy environment during day
    
    # Early morning quiet hours (06:00-08:00) — slightly elevated concern
    elif 6 <= hour < 8:
        weight += 0.05
    
    # ── Zone type adjustments ─────────────────────────────────────────
    # Commercial/entertainment zones have higher baseline noise
    if zone_type in ['commercial', 'industrial']:
        weight -= 0.05
    
    # Hawker centres during operating hours
    if zone_type == 'hawker' and 11 <= hour <= 20:
        weight -= 0.08
    
    # ── Ambient noise level adjustments ───────────────────────────────
    # High ambient noise (>75dB) — raise threshold
    if ambient_db > 75:
        weight -= 0.08
    elif ambient_db > 60:
        weight -= 0.04
    
    # Very quiet environment (<30dB) — any sound is more significant
    elif ambient_db < 30:
        weight += 0.05
    
    # ── Recent false alarm history ────────────────────────────────────
    # Stricter threshold for sensors with recent false alarms
    if recent_false_alarms >= 3:
        weight -= 0.10  # very strict on unreliable sensors
    elif recent_false_alarms >= 2:
        weight -= 0.05  # stricter on unreliable sensors
    elif recent_false_alarms >= 1:
        weight -= 0.02  # slight penalty
    
    # ── Recurrence detection ──────────────────────────────────────────
    # Same event class at same sensor 3x in 10 min — possible sensor fault
    # (This would be tracked externally and passed in)
    
    # Clamp to valid range
    return min(max(confidence + weight, 0.0), 1.0)


def get_time_context_label(hour: Optional[int] = None) -> str:
    """Get a human-readable time context label."""
    if hour is None:
        hour = datetime.now().hour
    
    if hour >= 23 or hour < 6:
        return "Late Night (High Alert)"
    elif 6 <= hour < 8:
        return "Early Morning (Elevated)"
    elif 8 <= hour < 11:
        return "Morning (Normal)"
    elif 11 <= hour < 14:
        return "Midday (Normal)"
    elif 14 <= hour < 17:
        return "Afternoon (Normal)"
    elif 17 <= hour < 21:
        return "Evening (Normal)"
    else:
        return "Night (Elevated)"


def get_zone_context_label(zone_type: str) -> str:
    """Get a human-readable zone context label."""
    labels = {
        'residential': 'Residential (Standard)',
        'commercial': 'Commercial (Higher Tolerance)',
        'hawker': 'Food Centre (Higher Tolerance)',
        'educational': 'Educational (Standard)',
        'industrial': 'Industrial (Highest Tolerance)',
    }
    return labels.get(zone_type, 'Unknown Zone')


def should_elevate_severity(
    base_severity: str,
    zone_type: str,
    hour: Optional[int] = None
) -> bool:
    """
    Determine if severity should be elevated based on context.
    Used for borderline cases where context tips the balance.
    """
    if hour is None:
        hour = datetime.now().hour
    
    # Late night incidents in residential areas — elevate
    if (hour >= 23 or hour < 6) and zone_type == 'residential':
        return True
    
    return False
