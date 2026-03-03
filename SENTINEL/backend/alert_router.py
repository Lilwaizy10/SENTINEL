"""
alert_router.py — Spec Section 9.7
Complete decision pipeline combining all false positive reduction layers.
Routes events based on final confidence after all filtering layers.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple
from enum import Enum

from event_window import EventWindow, calculate_sustained_confidence
from sequence_analyser import evaluate_sequence, SequenceResult
from context_scorer import apply_context_weight, get_zone_type
from corroboration import check_corroboration
from false_alarm_store import similarity_to_known_false_alarms


class AlertDecision(str, Enum):
    """Final routing decisions from Spec Section 9.7."""
    AUTO_ALERT = "AUTO_ALERT"      # Notify volunteers immediately
    HUMAN_REVIEW = "HUMAN_REVIEW"  # Hold for dispatcher review (10s)
    LOG_ONLY = "LOG_ONLY"          # Log but don't alert
    SUPPRESSED = "SUPPRESSED"      # Actively suppress (known false alarm)


async def route_event(
    event: Dict,
    final_confidence: float,
    false_alarm_similarity: float,
    severity: Optional[str],
    sequence_action: Optional[str] = None
) -> AlertDecision:
    """
    Final decision gate combining all 5 layers.
    Spec Section 9.7 — Complete Decision Pipeline
    
    Args:
        event: The incident event data
        final_confidence: Confidence after all adjustments
        false_alarm_similarity: Similarity to known false alarms (0.0-1.0)
        severity: Final severity after sequence analysis
        sequence_action: Action from sequence analysis
    
    Returns:
        AlertDecision enum value
    """
    # Layer 5: Suppress if very similar to known false alarm
    if false_alarm_similarity > 0.92:
        return AlertDecision.SUPPRESSED
    
    # Layer 2: Suppress if sequence analysis says accidental
    if severity is None or sequence_action == SequenceResult.LOG_ONLY.value:
        return AlertDecision.LOG_ONLY
    
    # Route by final confidence (Spec Section 9.1)
    if final_confidence > 0.85:
        return AlertDecision.AUTO_ALERT    # notify volunteers immediately
    elif final_confidence > 0.65:
        return AlertDecision.HUMAN_REVIEW  # dispatcher sees it for 10s before firing
    else:
        return AlertDecision.LOG_ONLY


async def apply_all_layers(
    event: Dict,
    yamnet_scores: List[float],
    class_names: List[str],
    recent_events: List[Dict],
    context: Optional[Dict] = None
) -> Tuple[AlertDecision, Dict]:
    """
    Apply all 5 false positive reduction layers to an event.
    
    Args:
        event: The incident event data
        yamnet_scores: Raw YAMNet classification scores (multiple frames)
        class_names: List of YAMNet class names
        recent_events: Recent events from other sensors for corroboration
        context: Optional context (zone_type, hour, ambient_db, etc.)
    
    Returns:
        Tuple of (AlertDecision, debug_info_dict)
    """
    debug = {
        'layers': {},
        'confidence_history': []
    }
    
    sound_type = event.get('type', event.get('sound_type', ''))
    sensor_id = event.get('sensor_id', '')
    base_confidence = event.get('confidence', 0.0)
    
    # ── Layer 1: Confidence + Duration Windowing ───────────────────────
    if len(yamnet_scores) >= 30:
        # Find class index for the detected sound type
        class_idx = class_names.index(sound_type) if sound_type in class_names else 0
        sustained_conf = calculate_sustained_confidence(yamnet_scores, class_idx)
        debug['layers']['layer1_window'] = {
            'sustained_confidence': sustained_conf,
            'frames_analyzed': len(yamnet_scores)
        }
        confidence = sustained_conf
    else:
        confidence = base_confidence
        debug['layers']['layer1_window'] = {
            'status': 'insufficient_frames',
            'frames_available': len(yamnet_scores)
        }
    
    debug['confidence_history'].append(('after_layer1', confidence))
    
    # ── Layer 2: Sequence Analysis ─────────────────────────────────────
    followon_classes = context.get('followon_classes', []) if context else []
    sequence_result = evaluate_sequence(sound_type, followon_classes)
    severity = sequence_result.get('severity')
    sequence_action = sequence_result.get('action')
    
    debug['layers']['layer2_sequence'] = {
        'trigger': sound_type,
        'followon': followon_classes,
        'action': sequence_action,
        'severity': severity,
        'label': sequence_result.get('label')
    }
    
    # Early exit if sequence says suppress
    if severity is None:
        debug['final_reason'] = 'Sequence analysis: accidental pattern detected'
        return AlertDecision.LOG_ONLY, debug
    
    # ── Layer 3: Time and Zone Context ─────────────────────────────────
    zone = event.get('zone', event.get('location', {}).get('zone', 'Unknown'))
    zone_type = context.get('zone_type', get_zone_type(zone)) if context else get_zone_type(zone)
    hour = context.get('hour') if context else None
    ambient_db = context.get('ambient_db', 0) if context else 0
    recent_false_alarms = context.get('recent_false_alarms', 0) if context else 0
    
    context_adjusted_conf = apply_context_weight(
        confidence,
        zone_type=zone_type,
        sensor_id=sensor_id,
        recent_false_alarms=recent_false_alarms,
        ambient_db=ambient_db,
        hour=hour
    )
    
    debug['layers']['layer3_context'] = {
        'zone': zone,
        'zone_type': zone_type,
        'hour': hour,
        'ambient_db': ambient_db,
        'recent_false_alarms': recent_false_alarms,
        'confidence_before': confidence,
        'confidence_after': context_adjusted_conf
    }
    
    confidence = context_adjusted_conf
    debug['confidence_history'].append(('after_layer3', confidence))
    
    # ── Layer 4: Multi-Sensor Corroboration ────────────────────────────
    corroboration_multiplier = check_corroboration(event, recent_events)
    corroborated_confidence = min(confidence * corroboration_multiplier, 1.0)
    
    debug['layers']['layer4_corroboration'] = {
        'multiplier': corroboration_multiplier,
        'confidence_before': confidence,
        'confidence_after': corroborated_confidence
    }
    
    confidence = corroborated_confidence
    debug['confidence_history'].append(('after_layer4', confidence))
    
    # ── Layer 5: False Alarm Similarity ────────────────────────────────
    # (Would require embeddings - simplified for now)
    embeddings = context.get('embeddings', []) if context else []
    if embeddings and sensor_id and sound_type:
        fa_similarity, should_suppress = await similarity_to_known_false_alarms(
            embeddings, sensor_id, sound_type
        )
        debug['layers']['layer5_false_alarm'] = {
            'similarity': fa_similarity,
            'should_suppress': should_suppress
        }
        
        if should_suppress:
            debug['final_reason'] = f'False alarm match: {fa_similarity:.2f} > 0.92'
            return AlertDecision.SUPPRESSED, debug
    else:
        debug['layers']['layer5_false_alarm'] = {
            'status': 'skipped',
            'reason': 'no_embeddings'
        }
    
    # ── Final Decision ─────────────────────────────────────────────────
    final_confidence = confidence
    
    decision = await route_event(
        event,
        final_confidence,
        debug['layers']['layer5_false_alarm'].get('similarity', 0.0),
        severity,
        sequence_action
    )
    
    debug['final_confidence'] = final_confidence
    debug['final_severity'] = severity
    debug['decision'] = decision.value
    
    return decision, debug


def get_decision_description(decision: AlertDecision) -> str:
    """Get human-readable description of the decision."""
    descriptions = {
        AlertDecision.AUTO_ALERT: "Alert volunteers immediately",
        AlertDecision.HUMAN_REVIEW: "Hold for dispatcher review (10 second delay)",
        AlertDecision.LOG_ONLY: "Log only — no alert fired",
        AlertDecision.SUPPRESSED: "Suppressed — matches known false alarm pattern"
    }
    return descriptions.get(decision, "Unknown decision")


def get_confidence_tier(confidence: float) -> str:
    """Get confidence tier label per Spec Section 9.1."""
    if confidence > 0.85:
        return "HIGH (Auto-Alert)"
    elif confidence > 0.65:
        return "MEDIUM (Human Review)"
    else:
        return "LOW (Log Only)"
