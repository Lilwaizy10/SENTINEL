"""
logic.py — Section 9: False Positive Reduction
Consolidates EventWindow, SequenceAnalyser, ContextScorer, and AlertRouter
into a single importable module for the SENTINEL backend.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional


# ── Constants ─────────────────────────────────────────────────────────────────

TRIGGER_LABELS: set[str] = {
    "Gunshot, gunfire",
    "Explosion",
    "Screaming",
    "Glass break",
    "Fire",
    "Siren",
    "Alarm",
}

BENIGN_NEIGHBOURS: set[str] = {
    "Music",
    "Speech",
    "Crowd",
    "Applause",
    "Fireworks",
    "Dog",
    "Vehicle",
    "Engine",
}

REQUIRED_HITS: int = 2          # consecutive trigger detections needed
MIN_CONFIDENCE: float = 0.55    # minimum YAMNet score to count
FP_SUPPRESS_THRESHOLD: float = 0.60  # FP score above this → suppress


# ── Data Structures ───────────────────────────────────────────────────────────

@dataclass
class AudioEvent:
    label: str
    confidence: float
    timestamp: float = field(default_factory=time.time)  # Unix epoch


class EventWindow:
    """
    Sliding time-window that retains AudioEvents within `window_seconds`.
    Thread-safe via deque operations.
    """

    def __init__(self, window_seconds: int = 10):
        self.window_seconds = window_seconds
        self._events: deque[AudioEvent] = deque()

    def add(self, event: AudioEvent) -> None:
        self._events.append(event)
        self._prune()

    def _prune(self) -> None:
        cutoff = time.time() - self.window_seconds
        while self._events and self._events[0].timestamp < cutoff:
            self._events.popleft()

    @property
    def events(self) -> list[AudioEvent]:
        self._prune()
        return list(self._events)

    def count_by_label(self, label: str) -> int:
        return sum(1 for e in self.events if e.label == label)

    def clear(self) -> None:
        self._events.clear()


# ── Sequence Analyser ─────────────────────────────────────────────────────────

class SequenceAnalyser:
    """
    Detects suspicious repeating patterns in an EventWindow.
    Fires when the same trigger label appears >= REQUIRED_HITS times
    within the window, each with confidence >= MIN_CONFIDENCE.
    """

    def __init__(self, window: EventWindow):
        self.window = window

    def is_suspicious(self) -> bool:
        for label in TRIGGER_LABELS:
            hits = [
                e for e in self.window.events
                if e.label == label and e.confidence >= MIN_CONFIDENCE
            ]
            if len(hits) >= REQUIRED_HITS:
                return True
        return False

    def dominant_label(self) -> Optional[str]:
        counts = {lbl: self.window.count_by_label(lbl) for lbl in TRIGGER_LABELS}
        best = max(counts, key=counts.get)
        return best if counts[best] > 0 else None

    def max_confidence(self) -> float:
        trigger_events = [e for e in self.window.events if e.label in TRIGGER_LABELS]
        if not trigger_events:
            return 0.0
        return max(e.confidence for e in trigger_events)


# ── Context Scorer ────────────────────────────────────────────────────────────

class ContextScorer:
    """
    Assigns a false-positive likelihood score based on contextual signals.

    Score range: 0.0 (definitely real) → 1.0 (almost certainly false positive)

    Factors:
      - Ratio of benign-context events in the window          (weight 0.5)
      - Inverse of mean confidence of trigger events          (weight 0.3)
      - Isolated single hit (no repetition)                   (weight 0.2)
    """

    def score(self, window: EventWindow) -> float:
        events = window.events
        if not events:
            return 1.0

        total = len(events)
        benign_count = sum(1 for e in events if e.label in BENIGN_NEIGHBOURS)
        trigger_events = [e for e in events if e.label in TRIGGER_LABELS]

        benign_ratio = benign_count / total

        if trigger_events:
            avg_trigger_conf = sum(e.confidence for e in trigger_events) / len(trigger_events)
            conf_factor = 1.0 - avg_trigger_conf
            isolation_penalty = 0.2 if len(trigger_events) == 1 else 0.0
        else:
            conf_factor = 1.0
            isolation_penalty = 0.2

        fp_score = (benign_ratio * 0.5) + (conf_factor * 0.3) + isolation_penalty
        return round(min(fp_score, 1.0), 4)


# ── Alert Router ──────────────────────────────────────────────────────────────

class AlertRouter:
    """
    Central decision-maker: combines SequenceAnalyser + ContextScorer to
    route each window state to one of three actions:
      - "dispatch"  → confirmed incident, alert volunteers
      - "monitor"   → borderline, keep watching
      - "suppress"  → likely false positive, do nothing
    """

    def __init__(self):
        self._scorer = ContextScorer()

    def evaluate(self, window: EventWindow) -> dict:
        """
        Returns a routing decision dict:
        {
            "action":    "dispatch" | "monitor" | "suppress",
            "fp_score":  float,
            "label":     str | None,
            "confidence": float,
            "reason":    str,
        }
        """
        analyser = SequenceAnalyser(window)
        fp_score = self._scorer.score(window)
        suspicious = analyser.is_suspicious()
        label = analyser.dominant_label()
        confidence = analyser.max_confidence()

        if fp_score >= FP_SUPPRESS_THRESHOLD:
            return {
                "action": "suppress",
                "fp_score": fp_score,
                "label": label,
                "confidence": confidence,
                "reason": f"FP score {fp_score:.2f} exceeds threshold",
            }

        if suspicious:
            return {
                "action": "dispatch",
                "fp_score": fp_score,
                "label": label,
                "confidence": confidence,
                "reason": f"Repeated '{label}' detections above confidence threshold",
            }

        return {
            "action": "monitor",
            "fp_score": fp_score,
            "label": label,
            "confidence": confidence,
            "reason": "Insufficient evidence — continuing to monitor",
        }


# ── Convenience factory ───────────────────────────────────────────────────────

def make_pipeline(window_seconds: int = 10) -> tuple[EventWindow, AlertRouter]:
    """Return a ready-to-use (EventWindow, AlertRouter) pair."""
    return EventWindow(window_seconds=window_seconds), AlertRouter()
