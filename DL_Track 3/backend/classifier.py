"""
classifier.py — Enhanced
Realistic mock ML response that mirrors what YAMNet would return.
Falls back to a deterministic mock when tensorflow is unavailable (hackathon-safe).
"""

from __future__ import annotations

import random
import io
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException
from models import ClassificationResult

router = APIRouter()

# ── Mock class library (subset of AudioSet ontology) ──────────────────────────

_INCIDENT_CLASSES = [
    ("Gunshot, gunfire",  (0.72, 0.97)),
    ("Explosion",         (0.68, 0.95)),
    ("Screaming",         (0.60, 0.92)),
    ("Glass break",       (0.55, 0.88)),
    ("Fire",              (0.50, 0.85)),
    ("Siren",             (0.65, 0.93)),
    ("Alarm",             (0.60, 0.90)),
]

_AMBIENT_CLASSES = [
    ("Speech",      (0.30, 0.70)),
    ("Music",       (0.25, 0.65)),
    ("Crowd",       (0.20, 0.55)),
    ("Dog",         (0.15, 0.50)),
    ("Vehicle",     (0.10, 0.45)),
    ("Wind",        (0.05, 0.35)),
    ("Rain",        (0.05, 0.30)),
]

_ALL_CLASSES = _INCIDENT_CLASSES + _AMBIENT_CLASSES


def _mock_classify(audio_bytes: Optional[bytes] = None) -> ClassificationResult:
    """
    Deterministic-ish mock that simulates YAMNet output.
    ~30 % of calls return an incident-class trigger.
    """
    if random.random() < 0.30:
        pool = _INCIDENT_CLASSES
    else:
        pool = _AMBIENT_CLASSES

    label, (lo, hi) = random.choice(pool)
    top_confidence = round(random.uniform(lo, hi), 4)

    # Build a plausible top-5
    others = [c for c in _ALL_CLASSES if c[0] != label]
    random.shuffle(others)
    top5 = [{"label": label, "score": top_confidence}]
    remaining = top_confidence
    for other_label, (olo, ohi) in others[:4]:
        score = round(random.uniform(0.01, remaining * 0.4), 4)
        top5.append({"label": other_label, "score": score})
        remaining -= score

    return ClassificationResult(
        label=label,
        confidence=top_confidence,
        top5=sorted(top5, key=lambda x: x["score"], reverse=True),
        mock=True,
    )


def _real_classify(audio_bytes: bytes) -> ClassificationResult:
    """Attempt a real YAMNet inference."""
    import numpy as np
    import soundfile as sf
    import tensorflow_hub as hub
    import csv, urllib.request

    model = hub.load("https://tfhub.dev/google/yamnet/1")
    class_map_url = (
        "https://raw.githubusercontent.com/tensorflow/models/master/"
        "research/audioset/yamnet/yamnet_class_map.csv"
    )
    with urllib.request.urlopen(class_map_url) as f:
        reader = csv.DictReader(line.decode() for line in f)
        class_names = [row["display_name"] for row in reader]

    audio_data, _ = sf.read(io.BytesIO(audio_bytes))
    if audio_data.ndim > 1:
        audio_data = audio_data.mean(axis=1)
    audio_data = audio_data.astype(np.float32)

    scores, _, _ = model(audio_data)
    mean_scores = scores.numpy().mean(axis=0)
    top_idx = int(np.argmax(mean_scores))

    top5 = [
        {"label": class_names[i], "score": float(mean_scores[i])}
        for i in np.argsort(mean_scores)[::-1][:5]
    ]

    return ClassificationResult(
        label=class_names[top_idx],
        confidence=float(mean_scores[top_idx]),
        top5=top5,
        mock=False,
    )


# ── FastAPI route ─────────────────────────────────────────────────────────────

@router.post("/classify", response_model=ClassificationResult)
async def classify_audio(file: UploadFile = File(...)):
    """
    Classify an uploaded audio file.
    Uses real YAMNet when tensorflow is available; falls back to a
    realistic mock response otherwise.
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    try:
        return _real_classify(contents)
    except Exception:
        # tensorflow not installed or model unavailable → use mock
        return _mock_classify(contents)
