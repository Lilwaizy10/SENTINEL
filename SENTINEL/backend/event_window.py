"""
event_window.py — Spec Section 9.2
Rolling window classifier for sustained confidence scoring.
Eliminates single transient false positives by requiring consistent classification.
"""

from __future__ import annotations

from collections import deque
from typing import List
import numpy as np

WINDOW_SECONDS = 3
FRAME_RATE = 10  # YAMNet outputs ~10 frames/sec
WINDOW_SIZE = WINDOW_SECONDS * FRAME_RATE  # 30 frames


class EventWindow:
    """
    Rolling window classifier that requires sustained signal, not single spikes.
    Spec Section 9.2 — Layer 1: Confidence + Duration Windowing
    """
    
    def __init__(self, window_size: int = WINDOW_SIZE):
        self.frames = deque(maxlen=window_size)
        self.window_size = window_size
    
    def add_frame(self, scores: np.ndarray, class_names: List[str] = None) -> None:
        """Add a new frame of classification scores."""
        self.frames.append(scores.copy())
    
    def get_sustained_confidence(self, class_idx: int) -> float:
        """
        Get sustained confidence for a specific class using 75th percentile.
        This ignores low spikes and rewards sustained signal.
        Returns 0.0 if not enough data yet.
        """
        if len(self.frames) < self.window_size:
            return 0.0  # not enough data yet
        
        all_scores = np.array(self.frames)
        # Use 75th percentile — ignores single spikes, rewards sustained signal
        return float(np.percentile(all_scores[:, class_idx], 75))
    
    def get_top_sustained_class(self, class_names: List[str]) -> tuple:
        """
        Get the class with highest sustained confidence.
        Returns (class_name, sustained_confidence) or (None, 0.0) if not enough data.
        """
        if len(self.frames) < self.window_size or not class_names:
            return None, 0.0
        
        all_scores = np.array(self.frames)
        num_classes = all_scores.shape[1]
        
        sustained_confidences = []
        for i in range(num_classes):
            conf = float(np.percentile(all_scores[:, i], 75))
            sustained_confidences.append(conf)
        
        if not sustained_confidences:
            return None, 0.0
        
        top_idx = int(np.argmax(sustained_confidences))
        return class_names[top_idx], sustained_confidences[top_idx]
    
    def reset(self) -> None:
        """Clear the window."""
        self.frames.clear()
    
    def is_ready(self) -> bool:
        """Check if window has enough data."""
        return len(self.frames) >= self.window_size


# Convenience function for one-off calculations
def calculate_sustained_confidence(
    frames: List[np.ndarray],
    class_idx: int,
    percentile: int = 75
) -> float:
    """
    Calculate sustained confidence from a list of score frames.
    
    Args:
        frames: List of numpy arrays containing classification scores
        class_idx: Index of the class to evaluate
        percentile: Percentile to use (75 recommended for false positive reduction)
    
    Returns:
        Sustained confidence score (0.0-1.0)
    """
    if not frames:
        return 0.0
    
    all_scores = np.array(frames)
    return float(np.percentile(all_scores[:, class_idx], percentile))
