"""
volunteer_notify.py — Section 2.2
Notification logic for dispatching alerts to volunteers.
"""

import httpx
from models import Incident, Volunteer


async def notify_volunteer(volunteer: Volunteer, incident: Incident) -> bool:
    """
    Send a push notification / SMS to a volunteer.
    Replace the stub below with your actual provider (e.g. Twilio, Firebase FCM).
    """
    payload = {
        "to": volunteer.phone,
        "body": (
            f"🚨 SENTINEL ALERT\n"
            f"Incident: {incident.type}\n"
            f"Location: {incident.location}\n"
            f"Severity: {incident.severity}\n"
            f"Please respond immediately."
        ),
    }
    # --- Stub: replace with real provider call ---
    print(f"[notify] Would send to {volunteer.name}: {payload['body']}")
    return True


def find_nearest_volunteer(
    volunteers: list[Volunteer], incident: Incident
) -> Volunteer | None:
    """Return the closest available volunteer using simple Euclidean distance."""
    available = [v for v in volunteers if v.status == "available"]
    if not available:
        return None

    def distance(v: Volunteer) -> float:
        return ((v.lat - incident.lat) ** 2 + (v.lng - incident.lng) ** 2) ** 0.5

    return min(available, key=distance)
