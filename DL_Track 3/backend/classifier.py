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
SENTINEL_WATCH_CLASSES: Dict[str, Tuple[str, str, float]] = {
    'Screaming': ('distress_scream', 'HIGH', 0.70),
    'Shatter': ('glass_break', 'HIGH', 0.72),          # slightly lowered
    'Gunshot, gunfire': ('gunshot', 'CRITICAL', 0.75), # slightly lowered
    'Thud': ('impact_thud', 'MEDIUM', 0.70),
    'Explosion': ('explosion', 'CRITICAL', 0.68),      # lowered from 0.78
    'Crying, sobbing': ('distress_cry', 'MEDIUM', 0.65),
    'Car alarm': ('car_alarm', 'LOW', 0.75),
}

SOUND_SEVERITY_MAP = {
    'gunshot': 'CRITICAL',
    'explosion': 'CRITICAL',
    'distress_scream': 'HIGH',
    'glass_break': 'HIGH',
    'screaming': 'HIGH',
    'impact_thud': 'MEDIUM',
    'distress_cry': 'MEDIUM',
    'car_alarm': 'LOW',
    'crowd_noise': 'LOW'
}

RESPONSE_MAP = {
    'CRITICAL': ['Police (999)', 'SCDF (995)', 'SGSecure'],
    'HIGH': ['SCDF (995)', 'SGSecure'],
    'MEDIUM': ['SGSecure'],
    'LOW': ['Dispatcher Review']
}

# ==============================
# Utilities
# ==============================
def _load_class_names_from_csv(lines_iterable) -> List[str]:
    """Parse the YAMNet class map CSV (skip header, ensure 521 display_names)."""
    reader = csv.reader(lines_iterable)
    _ = next(reader, None)  # header
    names = [row[2] for row in reader if len(row) >= 3]  # display_name column
    return names

def prepare_waveform(waveform: np.ndarray, sr: int, target_sr: int = 16000) -> np.ndarray:
    """
    Ensure mono, float32 in [-1, 1], 16kHz, no NaNs/infs, peak-normalized.
    """
    if waveform.dtype != np.float32:
        if np.issubdtype(waveform.dtype, np.integer):
            max_val = np.iinfo(waveform.dtype).max
            waveform = waveform.astype(np.float32) / max_val
        else:
            waveform = waveform.astype(np.float32)

    if waveform.ndim > 1:
        waveform = np.mean(waveform, axis=1, dtype=np.float32)

    if sr != target_sr:
        waveform = librosa.resample(y=waveform, orig_sr=sr, target_sr=target_sr).astype(np.float32)

    waveform = np.nan_to_num(waveform, nan=0.0, posinf=0.0, neginf=0.0)
    peak = float(np.max(np.abs(waveform))) if waveform.size else 0.0
    if peak > 0:
        waveform = waveform / peak  # peak normalize

    if waveform.size == 0:
        return np.zeros((target_sr,), dtype=np.float32)  # fallback: 1s silence

    return waveform

def temporal_pool(scores: np.ndarray,
                  waveform: np.ndarray,
                  sr: int = 16000,
                  mode: str = "top_p",
                  p: float = 0.10,
                  energy_quantile: float = 0.60) -> np.ndarray:
    """
    Energy-masked pooling:
    1) Compute short-term energy.
    2) Keep frames above the given energy quantile.
    3) Pool only those frames using max/mean/top_p.
    """
    # Approximate YAMNet hop ~10 ms
    hop = max(1, int(0.010 * sr))
    win = max(1, int(0.025 * sr))
    frames = max(1, 1 + (len(waveform) - win) // hop)

    energies = []
    for i in range(frames):
        s = i * hop
        e = min(s + win, len(waveform))
        seg = waveform[s:e]
        energies.append(float(np.sqrt(np.mean(seg**2))) if seg.size else 0.0)
    energies = np.asarray(energies, dtype=np.float32)

    # Match energy vector to scores frames
    T, C = scores.shape
    if len(energies) != T:
        x_old = np.linspace(0, 1, num=len(energies), endpoint=True)
        x_new = np.linspace(0, 1, num=T,          endpoint=True)
        energies = np.interp(x_new, x_old, energies).astype(np.float32)

    thr = np.quantile(energies, energy_quantile)  # keep top (1 - q) portion
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
        Tm = masked.shape[0]
        k = max(1, int(Tm * p))
        topk = np.sort(masked, axis=0)[-k:, :]
        return np.mean(topk, axis=0)
    else:
        raise ValueError(f"Unknown pooling mode: {mode}")

def best_frame_score_for_label(scores: np.ndarray, class_names: List[str], label_substring: str) -> float:
    idxs = [i for i, n in enumerate(class_names) if label_substring.lower() in n.lower()]
    if not idxs:
        return 0.0
    per_class_frame_max = np.max(scores[:, idxs], axis=0)
    return float(np.max(per_class_frame_max))

def map_to_sentinel_class(yamnet_class: str, confidence: float):
    for yamnet_key, (sentinel_label, severity, threshold) in SENTINEL_WATCH_CLASSES.items():
        if yamnet_key.lower() in yamnet_class.lower() or yamnet_class.lower() in yamnet_key.lower():
            return sentinel_label, severity, threshold
    return yamnet_class, 'LOW', 0.5

# Optional: improves recall for single bangs inside long clips
def extract_peak_window(waveform: np.ndarray, sr: int = 16000, win_sec: float = 1.0) -> np.ndarray:
    if waveform.size == 0:
        return waveform
    peak_idx = int(np.argmax(np.abs(waveform)))
    half = int((win_sec * sr) / 2)
    start = max(0, peak_idx - half)
    end = min(len(waveform), start + int(win_sec * sr))
    if end - start < int(win_sec * sr):
        start = max(0, end - int(win_sec * sr))
    return waveform[start:end].astype(np.float32)

# ==============================
# Model Loading
# ==============================
def load_yamnet_model():
    """Load YAMNet model and class names ONCE at startup."""
    global model, class_names
    if model is not None and class_names:
        print("✅ YAMNet model already loaded")
        return

    print("⏳ Loading YAMNet model from TensorFlow Hub...")
    try:
        model = hub.load('https://tfhub.dev/google/yamnet/1')
        print("✅ YAMNet model loaded successfully!")

        class_names_url = 'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv'
        try:
            response = urllib.request.urlopen(class_names_url)
            lines = io.TextIOWrapper(response, encoding='utf-8')
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
async def classify_audio(file: UploadFile):
    """
    Classify uploaded audio using YAMNet with energy-masked pooling and
    watchlist promotion for transient events.
    """
    global model, class_names

    if model is None or not class_names:
        load_yamnet_model()

    try:
        contents = await file.read()
        print(f"📁 Received file: {file.filename}, size: {len(contents)} bytes")

        waveform, sr = sf.read(io.BytesIO(contents))
        print(f"🎵 Audio loaded: {len(waveform)} samples, sample rate: {sr} Hz")

        waveform = prepare_waveform(waveform, sr, target_sr=16000)

        print("🚀 Running YAMNet inference...")
        wf = tf.convert_to_tensor(waveform, dtype=tf.float32)  # [n_samples]
        scores, embeddings, spectrogram = model(wf)            # scores: [frames, 521]
        scores = scores.numpy()
        print(f"✅ Inference complete. Scores shape: {scores.shape}")

        # 1) Energy-masked pooling tuned for transients
        pooled_scores = temporal_pool(scores, waveform, sr=16000, mode="top_p", p=0.10, energy_quantile=0.60)

        # 2) Exclude 'Silence' from ranking
        _scores = pooled_scores.copy()
        try:
            silence_idx = next(i for i, n in enumerate(class_names) if n.lower() == "silence")
            _scores[silence_idx] = -1.0
        except StopIteration:
            pass

        # Top-20 for debug
        top20_idx = np.argsort(_scores)[-20:][::-1]
        print("\n=== TOP 20 YAMNet (pooled, silence-excluded) ===")
        for rank, idx in enumerate(top20_idx, 1):
            name = class_names[idx] if idx < len(class_names) else f'Class_{idx}'
            conf = float(pooled_scores[idx])
            print(f"{rank:2d}. {name:30s} {conf:.2%}")

        # Build top-5 mapped results
        results = []
        for idx in top20_idx[:5]:
            class_name = class_names[idx] if idx < len(class_names) else f'Class_{idx}'
            confidence = float(pooled_scores[idx])
            sentinel_label, severity, threshold = map_to_sentinel_class(class_name, confidence)
            results.append({
                'class': class_name,
                'confidence': confidence,
                'sentinel_label': sentinel_label,
                'severity': severity,
                'threshold': threshold
            })

        # 3) Watchlist promotion via frame-level maxima
        watch_evidence = []
        for yamnet_key, (sentinel_label, severity, threshold) in SENTINEL_WATCH_CLASSES.items():
            s = best_frame_score_for_label(scores, class_names, yamnet_key)
            watch_evidence.append({
                'yamnet_key': yamnet_key,
                'sentinel_label': sentinel_label,
                'severity': severity,
                'threshold': threshold,
                'frame_max_confidence': s
            })
        watch_evidence_sorted = sorted(watch_evidence, key=lambda x: x['frame_max_confidence'], reverse=True)

        promoted = None
        for ev in watch_evidence_sorted:
            if ev['frame_max_confidence'] >= ev['threshold']:
                promoted = {
                    'class': ev['yamnet_key'],
                    'confidence': ev['frame_max_confidence'],
                    'sentinel_label': ev['sentinel_label'],
                    'severity': ev['severity'],
                    'threshold': ev['threshold'],
                    'via': 'watchlist_frame_max'
                }
                break

        top_result = promoted if promoted is not None else (results[0] if results else {
            'class': 'unknown', 'confidence': 0.0, 'sentinel_label': 'unknown', 'severity': 'LOW', 'threshold': 0.5
        })

        # 4) (Optional) Peak-window second pass for extra recall
        # Uncomment to enable
        # if top_result['severity'] != 'CRITICAL':
        #     peak_wf = extract_peak_window(waveform, sr=16000, win_sec=1.0)
        #     if len(peak_wf) > 0:
        #         wf_peak = tf.convert_to_tensor(peak_wf, dtype=tf.float32)
        #         scores_peak, _, _ = model(wf_peak)
        #         scores_peak = scores_peak.numpy()
        #         pooled_peak = np.max(scores_peak, axis=0)
        #         def peek(label_sub):
        #             idxs = [i for i, n in enumerate(class_names) if label_sub.lower() in n.lower()]
        #             return float(np.max(pooled_peak[idxs])) if idxs else 0.0
        #         exp_peak = peek('Explosion')
        #         gun_peak = peek('Gunshot, gunfire')
        #         if exp_peak >= 0.60 or gun_peak >= 0.70:
        #             promoted_label = 'explosion' if exp_peak >= gun_peak else 'gunshot'
        #             top_result = {
        #                 'class': 'PeakWindow',
        #                 'confidence': max(exp_peak, gun_peak),
        #                 'sentinel_label': promoted_label,
        #                 'severity': 'CRITICAL',
        #                 'threshold': 0.0,
        #                 'via': 'peak_window_max'
        #             }

        response = {
            'top_class': top_result['sentinel_label'],
            'confidence': top_result['confidence'],
            'severity': top_result['severity'],
            'all_classes': results,
            'watchlist': watch_evidence_sorted[:5],
            'recommended_response': RESPONSE_MAP.get(top_result['severity'], ['Dispatcher Review']),
            'model': 'YAMNet',
            'filename': file.filename
        }

        print(f"\n✅ Final classification: {response['top_class']} ({response['severity']}) @ {response['confidence']:.2%}")
        return response

    except Exception as e:
        print(f"❌ Classification error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")
