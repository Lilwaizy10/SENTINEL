"""
sequence_analyser.py — Spec Section 9.3
Analyses the 5-second audio window following a triggering event.
What happens after the sound matters as much as the sound itself.
"""

from __future__ import annotations

from typing import List, Dict, Optional
from enum import Enum


class SequenceResult(str, Enum):
    """Possible outcomes of sequence analysis."""
    AUTO_ALERT = "AUTO_ALERT"      # Clear distress pattern - notify immediately
    HUMAN_REVIEW = "HUMAN_REVIEW"  # Ambiguous - hold for dispatcher review
    LOG_ONLY = "LOG_ONLY"          # Likely false positive - just log
    SUPPRESSED = "SUPPRESSED"      # Confirmed accidental - suppress alert


# Sequence rules from Spec Section 9.3
SEQUENCE_RULES = [
    {
        'trigger': 'glass_break',
        'followon': ['silence', 'footsteps', 'running'],
        'window_s': 5,
        'result_severity': 'HIGH',
        'label': 'Possible break-in',
        'action': SequenceResult.AUTO_ALERT
    },
    {
        'trigger': 'glass_break',
        'followon': ['speech', 'laughter', 'applause'],
        'window_s': 5,
        'result_severity': None,  # None = suppress alert
        'label': 'Accidental breakage',
        'action': SequenceResult.LOG_ONLY
    },
    {
        'trigger': 'distress_scream',
        'followon': ['silence'],
        'window_s': 3,
        'result_severity': 'CRITICAL',
        'label': 'Victim may be incapacitated',
        'action': SequenceResult.AUTO_ALERT
    },
    {
        'trigger': 'distress_scream',
        'followon': ['speech', 'conversation', 'laughter'],
        'window_s': 3,
        'result_severity': 'LOW',
        'label': 'Excitement or play',
        'action': SequenceResult.LOG_ONLY
    },
    {
        'trigger': 'gunshot',
        'followon': ['silence', 'screaming', 'running'],
        'window_s': 5,
        'result_severity': 'CRITICAL',
        'label': 'Active threat',
        'action': SequenceResult.AUTO_ALERT
    },
    {
        'trigger': 'impact_thud',
        'followon': ['groan', 'silence', 'crying'],
        'window_s': 5,
        'result_severity': 'MEDIUM',
        'label': 'Possible fall — elderly risk',
        'action': SequenceResult.HUMAN_REVIEW
    },
    {
        'trigger': 'impact_thud',
        'followon': ['speech', 'laughter', 'ambient_noise'],
        'window_s': 3,
        'result_severity': None,
        'label': 'Dropped object',
        'action': SequenceResult.LOG_ONLY
    },
    {
        'trigger': 'explosion',
        'followon': ['screaming', 'running', 'glass_break'],
        'window_s': 5,
        'result_severity': 'CRITICAL',
        'label': 'Major incident',
        'action': SequenceResult.AUTO_ALERT
    },
]


def evaluate_sequence(
    trigger: str,
    followon_classes: List[str],
    window_s: float = 5.0
) -> Dict:
    """
    Evaluate follow-on audio pattern after a triggering event.
    
    Args:
        trigger: The initial sound type that triggered the alert
        followon_classes: List of sound classes detected in the follow-on window
        window_s: Duration of the follow-on window in seconds
    
    Returns:
        Dictionary with 'action', 'severity', and 'label' keys
    """
    for rule in SEQUENCE_RULES:
        if rule['trigger'] == trigger:
            # Check if any follow-on class matches the rule
            if any(f in followon_classes for f in rule['followon']):
                return {
                    'action': rule['action'].value,
                    'severity': rule['result_severity'],
                    'label': rule['label'],
                    'window_s': rule['window_s']
                }
    
    # No sequence match — default to human review for safety
    return {
        'action': SequenceResult.HUMAN_REVIEW.value,
        'severity': 'LOW',
        'label': 'No sequence match — dispatcher review recommended',
        'window_s': window_s
    }


def get_sequence_label(trigger: str, followon_classes: List[str]) -> str:
    """Get a human-readable label for the sequence analysis result."""
    result = evaluate_sequence(trigger, followon_classes)
    return result['label']


def should_alert(trigger: str, followon_classes: List[str]) -> bool:
    """
    Quick check: should this sequence trigger an alert?
    Returns True for AUTO_ALERT or HUMAN_REVIEW, False for LOG_ONLY/SUPPRESSED.
    """
    result = evaluate_sequence(trigger, followon_classes)
    return result['action'] in [
        SequenceResult.AUTO_ALERT.value,
        SequenceResult.HUMAN_REVIEW.value
    ]


def get_final_severity(
    base_severity: str,
    trigger: str,
    followon_classes: List[str]
) -> Optional[str]:
    """
    Get the final severity after sequence analysis.
    Can upgrade, downgrade, or suppress based on follow-on pattern.
    """
    result = evaluate_sequence(trigger, followon_classes)
    
    # If sequence says suppress, return None
    if result['severity'] is None:
        return None
    
    # If sequence has a severity, use it (may upgrade or downgrade)
    if result['severity']:
        return result['severity']
    
    # Otherwise keep base severity
    return base_severity


# Convenience class for stateful sequence tracking
class SequenceTracker:
    """
    Tracks audio sequence for a single potential incident.
    Collects follow-on sounds and evaluates when enough data is gathered.
    """
    
    def __init__(self, trigger: str, window_s: float = 5.0):
        self.trigger = trigger
        self.window_s = window_s
        self.followon_classes: List[str] = []
        self.start_time: Optional[float] = None
        self.evaluated = False
        self.result: Optional[Dict] = None
    
    def add_followon(self, sound_class: str) -> None:
        """Add a follow-on sound class."""
        if not self.evaluated:
            self.followon_classes.append(sound_class)
    
    def evaluate(self) -> Dict:
        """Evaluate the sequence and cache the result."""
        self.result = evaluate_sequence(self.trigger, self.followon_classes, self.window_s)
        self.evaluated = True
        return self.result
    
    def is_complete(self, elapsed_s: float) -> bool:
        """Check if the analysis window has elapsed."""
        return elapsed_s >= self.window_s
