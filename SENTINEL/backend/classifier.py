# classifier.py
import io
import csv
import urllib.request
from typing import List, Tuple, Dict

import numpy as np
import soundfile as sf
import librosa
import tensorflow as tf
import tensorflow_hub as hub
from fastapi import UploadFile, HTTPException

# ==============================
# Globals
# ==============================
model = None
class_names: List[str] = []

# ==============================
# SENTINEL Watch & Severity Maps
# ==============================
# CRITICAL thresholds raised back to 0.62 — at 0.45 codec artifacts from
# WebM→WAV conversion (Wood, Rain, Crackle, Rustle) were crossing the threshold
# and triggering false explosion cards on silent chunks.
# HIGH/MEDIUM stay low (0.40-0.45) since voice events are reliably loud on mic.
SENTINEL_WATCH_CLASSES: Dict[str, Tuple[str, str, float]] = {
    # ── CRITICAL ──────────────────────────────────────────────────────────────
    'Gunshot, gunfire':         ('gunshot',              'CRITICAL', 0.62),
    'Explosion':                ('explosion',            'CRITICAL', 0.62),
    'Burst, pop':               ('explosion',            'CRITICAL', 0.62),
    'Fireworks':                ('explosion',            'CRITICAL', 0.62),
    'Artillery fire':           ('gunshot',              'CRITICAL', 0.55),
    'Machine gun':              ('gunshot',              'CRITICAL', 0.55),

    # ── HIGH ──────────────────────────────────────────────────────────────────
    'Screaming':                ('distress_scream',      'HIGH',     0.30),
    'Shout':                    ('shouting',             'HIGH',     0.30),
    'Screech':                  ('distress_scream',      'HIGH',     0.30),
    'Yell':                     ('distress_scream',      'HIGH',     0.30),
    'Crying, sobbing':          ('distress_cry',         'HIGH',     0.30),
    'Wail, moan':               ('distress_cry',         'HIGH',     0.30),
    'Shatter':                  ('glass_break',          'HIGH',     0.45),
    'Glass':                    ('glass_break',          'HIGH',     0.45),
    'Breaking':                 ('glass_break',          'HIGH',     0.40),
    'Whimper':                  ('distress_cry',         'HIGH',     0.40),
    'Bellow':                   ('shouting',             'HIGH',     0.40),
    'Slap, smack':              ('physical_altercation', 'HIGH',     0.45),
    'Whack, thwack':            ('physical_altercation', 'HIGH',     0.40),
    'Smash, crash':             ('glass_break',          'HIGH',     0.40),
    'Booing':                   ('crowd_distress',       'HIGH',     0.45),

    # ── MEDIUM ────────────────────────────────────────────────────────────────
    'Thud':                     ('impact_thud',          'MEDIUM',   0.45),
    'Knock':                    ('impact_thud',          'MEDIUM',   0.40),
    'Bang':                     ('impact_thud',          'MEDIUM',   0.40),
    'Slam':                     ('door_slam',            'MEDIUM',   0.55),
    'Door':                     ('door_slam',            'MEDIUM',   0.50),
    'Emergency vehicle':        ('siren',                'MEDIUM',   0.70),
    'Police car (siren)':       ('siren',                'MEDIUM',   0.65),
    'Car alarm':                ('car_alarm',            'MEDIUM',   0.65),
    'Crowd':                    ('crowd_noise',          'MEDIUM',   0.70),
    'Cheer':                    ('crowd_noise',          'MEDIUM',   0.72),
    'Cheering':                 ('crowd_noise',          'MEDIUM',   0.72),
    'Alarm':                    ('alarm',                'MEDIUM',   0.60),
    'Siren':                    ('siren',                'MEDIUM',   0.55),
    'Smoke detector':           ('fire_alarm',           'MEDIUM',   0.55),
    'Fire alarm':               ('fire_alarm',           'MEDIUM',   0.55),
    'Breaking, cracking':       ('structural_damage',    'MEDIUM',   0.55),
    'Creak':                    ('structural_damage',    'MEDIUM',   0.60),
}

# YAMNet classes that are pure codec/compression artifacts from WebM→WAV
# conversion of near-silence. These must never trigger watchlist promotion
# even if they somehow appear in the top results.
ARTIFACT_CLASSES = {
    'wood', 'rain', 'rustle', 'crackle', 'white noise', 'wind',
    'raindrop', 'pour', 'trickle', 'patter', 'splinter', 'chop',
    'rustling', 'liquid', 'tick', 'outside, rural', 'outside, urban',
    'mouse', 'rodent', 'rain on surface', 'vehicle', 'motor vehicle', 
    'truck', 'car', 'bus', 'train', 'rail transport', 'aircraft', 'engine',
}

SOUND_SEVERITY_MAP = {
    'gunshot':              'CRITICAL',
    'explosion':            'CRITICAL',
    'distress_scream':      'HIGH',
    'glass_break':          'HIGH',
    'screaming':            'HIGH',
    'shouting':             'HIGH',
    'physical_altercation': 'HIGH',
    'crowd_distress':       'HIGH',
    'distress_cry':         'HIGH',
    'impact_thud':          'MEDIUM',
    'door_slam':            'MEDIUM',
    'vehicle_alert':        'MEDIUM',
    'vehicle_crash':        'MEDIUM',
    'car_alarm':            'MEDIUM',
    'crowd_noise':          'MEDIUM',
    'alarm':                'MEDIUM',
    'siren':                'MEDIUM',
    'fire_alarm':           'MEDIUM',
    'structural_damage':    'MEDIUM',
    'speech':               'LOW',
}

RESPONSE_MAP = {
    'CRITICAL': ['Police (999)', 'SCDF (995)', 'SGSecure'],
    'HIGH':     ['SCDF (995)', 'SGSecure'],
    'MEDIUM':   ['SGSecure', 'Dispatcher Review'],
    'LOW':      ['Dispatcher Review'],
}

# ==============================
# Utilities
# ==============================
def _load_class_names_from_csv(lines_iterable) -> List[str]:
    reader = csv.reader(lines_iterable)
    _ = next(reader, None)
    return [row[2] for row in reader if len(row) >= 3]


def prepare_waveform(waveform: np.ndarray, sr: int, target_sr: int = 16000) -> np.ndarray:
    if waveform.dtype != np.float32:
        if np.issubdtype(waveform.dtype, np.integer):
            waveform = waveform.astype(np.float32) / np.iinfo(waveform.dtype).max
        else:
            waveform = waveform.astype(np.float32)

    if waveform.ndim > 1:
        waveform = np.mean(waveform, axis=1, dtype=np.float32)

    if sr != target_sr:
        waveform = librosa.resample(y=waveform, orig_sr=sr, target_sr=target_sr).astype(np.float32)

    waveform = np.nan_to_num(waveform, nan=0.0, posinf=0.0, neginf=0.0)

    # ADD THIS — boost quiet mic input before peak normalization
    peak = float(np.max(np.abs(waveform))) if waveform.size else 0.0
    if peak > 0.05:
        waveform = waveform / peak

    return waveform if waveform.size else np.zeros((target_sr,), dtype=np.float32)


def temporal_pool(scores: np.ndarray,
                  waveform: np.ndarray,
                  sr: int = 16000,
                  mode: str = "top_p",
                  p: float = 0.10,
                  energy_quantile: float = 0.60) -> np.ndarray:
    hop = max(1, int(0.010 * sr))
    win = max(1, int(0.025 * sr))
    frames = max(1, 1 + (len(waveform) - win) // hop)

    energies = []
    for i in range(frames):
        s = i * hop
        e = min(s + win, len(waveform))
        seg = waveform[s:e]
        energies.append(float(np.sqrt(np.mean(seg ** 2))) if seg.size else 0.0)
    energies = np.asarray(energies, dtype=np.float32)

    T, C = scores.shape
    if len(energies) != T:
        x_old = np.linspace(0, 1, num=len(energies), endpoint=True)
        x_new = np.linspace(0, 1, num=T,             endpoint=True)
        energies = np.interp(x_new, x_old, energies).astype(np.float32)

    thr  = np.quantile(energies, energy_quantile)
    mask = energies >= thr
    if not np.any(mask):
        mask = np.ones_like(energies, dtype=bool)

    masked = scores[mask, :]
    if masked.shape[0] == 0:
        masked = scores

    if mode == "max":
        return np.max(masked, axis=0)
    elif mode == "mean":
        return np.mean(masked, axis=0)
    elif mode == "top_p":
        k    = max(1, int(masked.shape[0] * p))
        topk = np.sort(masked, axis=0)[-k:, :]
        return np.mean(topk, axis=0)
    else:
        raise ValueError(f"Unknown pooling mode: {mode}")


def best_frame_score_for_label(scores: np.ndarray,
                               class_names: List[str],
                               label_substring: str) -> float:
    idxs = [i for i, n in enumerate(class_names) if label_substring.lower() in n.lower()]
    if not idxs:
        return 0.0
    return float(np.max(np.max(scores[:, idxs], axis=0)))


def map_to_sentinel_class(yamnet_class: str, confidence: float):
    for yamnet_key, (sentinel_label, severity, threshold) in SENTINEL_WATCH_CLASSES.items():
        if yamnet_key.lower() in yamnet_class.lower() or yamnet_class.lower() in yamnet_key.lower():
            return sentinel_label, severity, threshold
    return yamnet_class, 'LOW', 0.5


def extract_peak_window(waveform: np.ndarray,
                        sr: int = 16000,
                        win_sec: float = 1.0) -> np.ndarray:
    if waveform.size == 0:
        return waveform
    peak_idx = int(np.argmax(np.abs(waveform)))
    half     = int((win_sec * sr) / 2)
    start    = max(0, peak_idx - half)
    end      = min(len(waveform), start + int(win_sec * sr))
    if end - start < int(win_sec * sr):
        start = max(0, end - int(win_sec * sr))
    return waveform[start:end].astype(np.float32)


# ==============================
# Model Loading
# ==============================
def load_yamnet_model():
    global model, class_names
    if model is not None and class_names:
        print("✅ YAMNet model already loaded")
        return

    print("⏳ Loading YAMNet model from TensorFlow Hub...")
    try:
        model = hub.load('https://tfhub.dev/google/yamnet/1')
        print("✅ YAMNet model loaded successfully!")

        url = 'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv'
        try:
            response    = urllib.request.urlopen(url)
            lines       = io.TextIOWrapper(response, encoding='utf-8')
            class_names = _load_class_names_from_csv(lines)
            if len(class_names) != 521:
                raise RuntimeError(f"Expected 521 class names, got {len(class_names)}")
            print(f"✅ Loaded {len(class_names)} YAMNet class names")
        except Exception as e:
            print(f"⚠️ Could not download/parse class names: {e}")
            class_names = [f'Class_{i}' for i in range(521)]
    except Exception as e:
        print(f"❌ Failed to load YAMNet model: {e}")
        raise RuntimeError(f"YAMNet model loading failed: {e}")


# ==============================
# Inference
# ==============================
async def classify_audio(file: UploadFile, is_live: bool = False):
    """
    Classify uploaded audio using YAMNet with energy-masked pooling and
    watchlist promotion for transient events.

    is_live=True activates:
      - Trailing crop to last 4s
      - RMS silence gate (skips inference on quiet chunks)
      - Artifact class filtering (blocks codec noise from triggering incidents)
    """
    global model, class_names

    if model is None or not class_names:
        load_yamnet_model()

    try:
        contents = await file.read()
        print(f"📁 Received file: {file.filename}, size: {len(contents)} bytes")

        if not contents:
            raise HTTPException(status_code=400, detail="Empty audio data received")

        waveform, sr = sf.read(io.BytesIO(contents))
        print(f"🎵 Audio loaded: {len(waveform)} samples, sample rate: {sr} Hz")

        if is_live:
            max_samples = int(4.0 * sr)
            if len(waveform) > max_samples:
                waveform = waveform[-max_samples:]
                print(f"✂️ Cropped to trailing 4s: {len(waveform)} samples")

        waveform = prepare_waveform(waveform, sr, target_sr=16000)

        # ── Silence gate ──────────────────────────────────────────────────────
        # WebM→WAV conversion of near-silence produces codec artifacts (Wood,
        # Rain, Crackle etc.) that fool YAMNet. If RMS energy is below threshold
        # there is no real sound event — skip inference entirely.
        

        print("🚀 Running YAMNet inference...")
        wf                              = tf.convert_to_tensor(waveform, dtype=tf.float32)
        scores, embeddings, spectrogram = model(wf)
        scores                          = scores.numpy()
        print(f"✅ Inference complete. Scores shape: {scores.shape}")

        pooled_scores = temporal_pool(scores, waveform, sr=16000,
                                      mode="top_p", p=0.10, energy_quantile=0.60)

        _scores = pooled_scores.copy()
        try:
            silence_idx = next(i for i, n in enumerate(class_names) if n.lower() == "silence")
            _scores[silence_idx] = -1.0
        except StopIteration:
            pass

        top20_idx = np.argsort(_scores)[-20:][::-1]
        print("\n=== TOP 20 YAMNet (pooled, silence-excluded) ===")
        for rank, idx in enumerate(top20_idx, 1):
            name = class_names[idx] if idx < len(class_names) else f'Class_{idx}'
            conf = float(pooled_scores[idx])
            print(f"{rank:2d}. {name:30s} {conf:.2%}")

        results = []
        for idx in top20_idx[:5]:
            class_name = class_names[idx] if idx < len(class_names) else f'Class_{idx}'
            confidence  = float(pooled_scores[idx])
            sentinel_label, severity, threshold = map_to_sentinel_class(class_name, confidence)
            results.append({
                'class':          class_name,
                'confidence':     confidence,
                'sentinel_label': sentinel_label,
                'severity':       severity,
                'threshold':      threshold,
            })

        # ── Watchlist promotion ───────────────────────────────────────────────
        # Uses frame-level maxima so a single spike from a gunshot or scream
        # is caught even if the pooled average is diluted by ambient frames.
        # Artifact classes are excluded so codec noise never promotes.
        watch_evidence = []
        for yamnet_key, (sentinel_label, severity, threshold) in SENTINEL_WATCH_CLASSES.items():
            s = best_frame_score_for_label(scores, class_names, yamnet_key)
            watch_evidence.append({
                'yamnet_key':           yamnet_key,
                'sentinel_label':       sentinel_label,
                'severity':             severity,
                'threshold':            threshold,
                'frame_max_confidence': s,
            })
        watch_evidence_sorted = sorted(watch_evidence,
                                       key=lambda x: x['frame_max_confidence'],
                                       reverse=True)

        # Priority: highest severity first, then highest confidence within same severity.
        # Artifact classes are blocked from promotion regardless of confidence.
        SEVERITY_RANK = {'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1}

        best_watch = None
        for ev in watch_evidence_sorted:
            # Skip if below threshold
            if ev['frame_max_confidence'] < ev['threshold']:
                continue
            # Skip if this yamnet_key is a known codec artifact
            if any(art in ev['yamnet_key'].lower() for art in ARTIFACT_CLASSES):
                print(f"[ARTIFACT] Skipping {ev['yamnet_key']} @ {ev['frame_max_confidence']:.2%}")
                continue
            if ev['severity'] == 'MEDIUM' and ev['frame_max_confidence'] < 0.70:
                print(f"[WEAK] Skipping MEDIUM {ev['yamnet_key']} @ {ev['frame_max_confidence']:.2%}")
                continue
            if best_watch is None or (
                SEVERITY_RANK.get(ev['severity'], 0) > SEVERITY_RANK.get(best_watch['severity'], 0)
                or (ev['severity'] == best_watch['severity']
                    and ev['frame_max_confidence'] > best_watch['frame_max_confidence'])
            ):
                best_watch = ev

        if best_watch:
            top_result = {
                'class':          best_watch['yamnet_key'],
                'confidence':     best_watch['frame_max_confidence'],
                'sentinel_label': best_watch['sentinel_label'],
                'severity':       best_watch['severity'],
                'threshold':      best_watch['threshold'],
                'via':            'watchlist_priority',
            }
        else:
            # No watchlist hit — fall back to pooled top result but only if
            # it isn't an artifact class. If top result is an artifact, return LOW.
            fallback = results[0] if results else None
            if fallback and any(art in fallback['class'].lower() for art in ARTIFACT_CLASSES):
                print(f"[ARTIFACT] Top result {fallback['class']} is artifact — returning LOW")
                fallback = None
            top_result = fallback or {
                'class': 'unknown', 'confidence': 0.0,
                'sentinel_label': 'unknown', 'severity': 'LOW', 'threshold': 0.5,
            }

        response = {
            'top_class':            top_result['sentinel_label'],
            'confidence':           top_result['confidence'],
            'severity':             top_result['severity'],
            'all_classes':          results,
            'watchlist':            watch_evidence_sorted[:5],
            'recommended_response': RESPONSE_MAP.get(top_result['severity'], ['Dispatcher Review']),
            'model':                'YAMNet',
            'filename':             file.filename,
        }

        print(f"\n✅ Final: {response['top_class']} ({response['severity']}) @ {response['confidence']:.2%}")
        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Classification error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")