"""
pi_sensor.py — Section 6.4
Main loop for the Raspberry Pi edge device.
Continuously records audio, classifies it locally (or sends to backend),
and forwards confirmed events to the SENTINEL backend API.
"""

import time
import json
import struct
import wave
import io
import urllib.request
import urllib.parse

# ── Config ────────────────────────────────────────────────────────────────────
BACKEND_URL = "http://<YOUR_SERVER_IP>:8000"  # TODO: set your server IP
SAMPLE_RATE = 16000
CHUNK_SECONDS = 3
DEVICE_ID = "pi-sensor-01"
LOCATION = {"lat": 1.3521, "lng": 103.8198, "name": "Sensor Location"}

# ── Helpers ───────────────────────────────────────────────────────────────────

def record_audio(seconds: int = CHUNK_SECONDS) -> bytes:
    """Record audio from the default mic using PyAudio."""
    try:
        import pyaudio
    except ImportError:
        raise RuntimeError("pyaudio not installed. Run: pip install pyaudio")

    pa = pyaudio.PyAudio()
    stream = pa.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=1024,
    )
    frames = []
    for _ in range(0, int(SAMPLE_RATE / 1024 * seconds)):
        frames.append(stream.read(1024))
    stream.stop_stream()
    stream.close()
    pa.terminate()

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b"".join(frames))
    return buf.getvalue()


def classify_remote(audio_bytes: bytes) -> dict:
    """Send audio to the FastAPI /classify endpoint."""
    boundary = "----SentinelBoundary"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="chunk.wav"\r\n'
        f"Content-Type: audio/wav\r\n\r\n"
    ).encode() + audio_bytes + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"{BACKEND_URL}/classify",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def report_incident(label: str, confidence: float) -> None:
    """POST a detected incident to the backend."""
    payload = json.dumps({
        "type": label,
        "location": LOCATION["name"],
        "lat": LOCATION["lat"],
        "lng": LOCATION["lng"],
        "severity": "HIGH" if confidence > 0.85 else "MEDIUM",
        "confidence": confidence,
        "device_id": DEVICE_ID,
    }).encode()

    req = urllib.request.Request(
        f"{BACKEND_URL}/incidents",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
        print(f"[pi] Incident reported: {label} ({confidence:.2f})")
    except Exception as e:
        print(f"[pi] Failed to report: {e}")


# ── Main Loop ─────────────────────────────────────────────────────────────────

ALERT_LABELS = {"Gunshot, gunfire", "Explosion", "Screaming", "Glass break", "Fire"}
CONFIDENCE_THRESHOLD = 0.60

def main():
    print(f"[pi] SENTINEL edge sensor starting — device {DEVICE_ID}")
    while True:
        try:
            print("[pi] Recording…")
            audio = record_audio()
            result = classify_remote(audio)
            label = result.get("label", "")
            confidence = result.get("confidence", 0.0)
            print(f"[pi] Classified: {label} ({confidence:.2f})")

            if label in ALERT_LABELS and confidence >= CONFIDENCE_THRESHOLD:
                report_incident(label, confidence)

        except Exception as e:
            print(f"[pi] Error: {e}")

        time.sleep(1)


if __name__ == "__main__":
    main()
