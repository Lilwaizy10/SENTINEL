import tensorflow_hub as hub
import numpy as np
import soundfile as sf
import io
import librosa
from fastapi import UploadFile, HTTPException
import os

# Global model variable
model = None
class_names = []

def load_yamnet_model():
    """Load YAMNet model and class names ONCE at startup"""
    global model, class_names
    
    if model is not None:
        print("✅ YAMNet model already loaded")
        return
    
    print("⏳ Loading YAMNet model from TensorFlow Hub...")
    try:
        model = hub.load('https://tfhub.dev/google/yamnet/1')
        print("✅ YAMNet model loaded successfully!")
        
        # Load class names
        class_names_url = 'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv'
        import urllib.request
        import csv
        
        try:
            response = urllib.request.urlopen(class_names_url)
            lines = io.TextIOWrapper(response, encoding='utf-8')
            reader = csv.reader(lines)
            class_names = [row[2] for row in reader]  # Column 2 has class names
            print(f"✅ Loaded {len(class_names)} class names")
        except Exception as e:
            print(f"⚠️ Could not download class names: {e}")
            # Fallback: create dummy class names
            class_names = [f'Class_{i}' for i in range(521)]
            
    except Exception as e:
        print(f"❌ Failed to load YAMNet model: {e}")
        raise RuntimeError(f"YAMNet model loading failed: {e}")

# SENTINEL watch classes mapping (Spec Section 6.2)
SENTINEL_WATCH_CLASSES = {
    'Screaming': ('distress_scream', 'HIGH', 0.70),
    'Shatter': ('glass_break', 'HIGH', 0.75),
    'Gunshot, gunfire': ('gunshot', 'CRITICAL', 0.80),
    'Thud': ('impact_thud', 'MEDIUM', 0.72),
    'Explosion': ('explosion', 'CRITICAL', 0.78),
    'Crying, sobbing': ('distress_cry', 'MEDIUM', 0.68),
    'Car alarm': ('car_alarm', 'LOW', 0.80),
}

# Severity mapping (Spec Section 5.5)
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

def map_to_sentinel_class(yamnet_class: str, confidence: float):
    """Map YAMNet class to SENTINEL label with severity"""
    for yamnet_key, (sentinel_label, severity, threshold) in SENTINEL_WATCH_CLASSES.items():
        # Check if YAMNet class matches (case-insensitive partial match)
        if yamnet_key.lower() in yamnet_class.lower() or yamnet_class.lower() in yamnet_key.lower():
            return sentinel_label, severity, threshold
    
    # If no match found, return the original class name
    return yamnet_class, 'LOW', 0.5

async def classify_audio(file: UploadFile):
    """
    Classify uploaded audio using REAL YAMNet model
    Returns top-5 classifications with confidence scores
    """
    global model, class_names
    
    # Ensure model is loaded
    if model is None:
        load_yamnet_model()
    
    try:
        # Read uploaded file
        contents = await file.read()
        print(f"📁 Received file: {file.filename}, size: {len(contents)} bytes")
        
        # Load audio from bytes
        waveform, sr = sf.read(io.BytesIO(contents))
        print(f"🎵 Audio loaded: {len(waveform)} samples, sample rate: {sr}Hz")
        
        # Convert stereo to mono if needed
        if len(waveform.shape) > 1:
            waveform = np.mean(waveform, axis=1)
            print("🔊 Converted stereo to mono")
        
        # Resample to 16kHz if needed (YAMNet requirement)
        if sr != 16000:
            waveform = librosa.resample(waveform, orig_sr=sr, target_sr=16000)
            print(f"🔄 Resampled from {sr}Hz to 16000Hz")
        
        # Run YAMNet inference
        print("Running YAMNet inference...")
        scores, embeddings, spectrogram = model(waveform)
        print(f"Inference complete. Scores shape: {scores.shape}")

        # Get mean scores across time (average over all frames)
        mean_scores = np.mean(scores, axis=0)

        # Get TOP 20 classes to see what YAMNet actually detects
        top20_idx = np.argsort(mean_scores)[-20:][::-1]

        print("\n=== TOP 20 YAMNet CLASSES ===")
        for rank, idx in enumerate(top20_idx, 1):
            class_name = class_names[idx] if idx < len(class_names) else f'Class_{idx}'
            confidence = float(mean_scores[idx])
            print(f"{rank:2d}. {class_name:30s} {confidence:.2%}")

        # Get top-5 indices for the response
        top5_idx = top20_idx[:5]

        print("\n=== TOP 5 SENTINEL MAPPED ===")

        # Build results
        results = []
        for rank, idx in enumerate(top5_idx, 1):
            class_name = class_names[idx] if idx < len(class_names) else f'Class_{idx}'
            confidence = float(mean_scores[idx])

            # Map to SENTINEL class
            sentinel_label, severity, threshold = map_to_sentinel_class(class_name, confidence)

            print(f"{rank}. {class_name} -> {sentinel_label} ({severity}): {confidence:.2%}")

            results.append({
                'class': class_name,
                'confidence': confidence,
                'sentinel_label': sentinel_label,
                'severity': severity,
                'threshold': threshold
            })
        
        # Get top classification
        top_result = results[0]
        
        response = {
            'top_class': top_result['sentinel_label'],
            'confidence': top_result['confidence'],
            'severity': top_result['severity'],
            'all_classes': results,
            'recommended_response': RESPONSE_MAP.get(top_result['severity'], ['Dispatcher Review']),
            'model': 'YAMNet',
            'filename': file.filename
        }
        
        print(f"\n✅ Final classification: {response['top_class']} ({response['severity']})")
        return response
        
    except Exception as e:
        print(f"❌ Classification error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")
