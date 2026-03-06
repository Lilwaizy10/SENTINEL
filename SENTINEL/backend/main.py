from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio, json, threading, sys, os, tempfile, subprocess, time
from uuid import uuid4
from typing import List, Optional
from datetime import datetime

# === Force UTF-8 on Windows ===
if sys.platform == "win32":
    os.system('chcp 65001 >nul 2>&1')
    sys.stdout.reconfigure(encoding='utf-8')

# === Safe Classifier Import ===
CLASSIFIER_AVAILABLE = False
classify_audio = None
load_yamnet_model = None

try:
    from classifier import classify_audio as real_classify, load_yamnet_model
    CLASSIFIER_AVAILABLE = True
    print("[OK] Classifier module imported successfully")
except Exception as e:
    print(f"[WARN] Classifier import failed: {e}")
    print("[WARN] Using mock classifier for demo")

    async def real_classify(file, is_live: bool = False):
        """Mock classifier fallback — always returns a full all_classes array
        so ClassificationBars has data to render regardless of filename."""
        filename = getattr(file, 'filename', 'unknown').lower()
        if 'explosion' in filename or 'gunshot' in filename:
            return {
                'top_class': 'explosion', 'confidence': 0.89, 'severity': 'CRITICAL',
                'all_classes': [
                    {'class': 'Explosion',    'confidence': 0.89, 'sentinel_label': 'explosion',      'severity': 'CRITICAL'},
                    {'class': 'Gunshot',      'confidence': 0.72, 'sentinel_label': 'gunshot',        'severity': 'CRITICAL'},
                    {'class': 'Glass break',  'confidence': 0.51, 'sentinel_label': 'glass_break',    'severity': 'HIGH'},
                    {'class': 'Loud bang',    'confidence': 0.38, 'sentinel_label': 'impact_thud',    'severity': 'MEDIUM'},
                    {'class': 'Music',        'confidence': 0.09, 'sentinel_label': 'background',     'severity': 'LOW'},
                ],
                'recommended_response': ['Police (999)', 'SCDF (995)', 'SGSecure'],
                'model': 'YAMNet (mock)'
            }
        elif 'scream' in filename:
            return {
                'top_class': 'distress_scream', 'confidence': 0.87, 'severity': 'HIGH',
                'all_classes': [
                    {'class': 'Screaming',    'confidence': 0.87, 'sentinel_label': 'distress_scream','severity': 'HIGH'},
                    {'class': 'Crying',       'confidence': 0.61, 'sentinel_label': 'distress_cry',   'severity': 'HIGH'},
                    {'class': 'Shout',        'confidence': 0.44, 'sentinel_label': 'shouting',       'severity': 'MEDIUM'},
                    {'class': 'Speech',       'confidence': 0.22, 'sentinel_label': 'speech',         'severity': 'LOW'},
                    {'class': 'Music',        'confidence': 0.05, 'sentinel_label': 'background',     'severity': 'LOW'},
                ],
                'recommended_response': ['SCDF (995)', 'SGSecure'],
                'model': 'YAMNet (mock)'
            }
        else:
            # FIX BUG 2: was returning all_classes: [] — ClassificationBars got
            # an empty array and showed "Waiting for audio input..." permanently.
            # Now always returns plausible ambient-noise results for live chunks.
            return {
                'top_class': 'impact_thud', 'confidence': 0.72, 'severity': 'MEDIUM',
                'all_classes': [
                    {'class': 'Impact/thud',  'confidence': 0.72, 'sentinel_label': 'impact_thud',   'severity': 'MEDIUM'},
                    {'class': 'Footsteps',    'confidence': 0.48, 'sentinel_label': 'footsteps',     'severity': 'LOW'},
                    {'class': 'Speech',       'confidence': 0.31, 'sentinel_label': 'speech',        'severity': 'LOW'},
                    {'class': 'Door slam',    'confidence': 0.21, 'sentinel_label': 'door_slam',     'severity': 'LOW'},
                    {'class': 'Silence',      'confidence': 0.08, 'sentinel_label': 'silence',       'severity': 'LOW'},
                ],
                'recommended_response': ['SGSecure'],
                'model': 'YAMNet (mock)'
            }

# === Global State ===
model_loaded = False

# FIX #18: Debounce table — tracks last broadcast time per sound_type.
# Prevents the same classification from firing a new incident card on every
# 1-second chunk. A sound_type is suppressed if it was broadcast within the
# last DEBOUNCE_SECONDS seconds.
_last_broadcast: dict = {}      # sound_type -> timestamp (float)
DEBOUNCE_SECONDS = 5

# FIX #17: Only broadcast MEDIUM / HIGH / CRITICAL to the alert feed.
# LOW (car_alarm etc.) and unrecognised classes are logged only, matching
# the spec's LOG_ONLY tier. Ambient speech/music during the live demo will
# never produce incident cards.
BROADCAST_SEVERITIES = {"MEDIUM", "HIGH", "CRITICAL"}

# === Lifespan Handler ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    global model_loaded
    print("[INFO] Starting SENTINEL backend...")
    if CLASSIFIER_AVAILABLE:
        def load_in_thread():
            global model_loaded
            try:
                load_yamnet_model()
                model_loaded = True
                print("[OK] YAMNet model loaded in background")
            except Exception as e:
                print(f"[WARN] Model load failed: {e}")
        threading.Thread(target=load_in_thread, daemon=True).start()
    yield
    print("[INFO] Shutting down SENTINEL backend...")

# === App Initialization ===
app = FastAPI(title='SENTINEL API', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Health Check ===
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "model_loaded": model_loaded,
        "classifier_available": CLASSIFIER_AVAILABLE
    }

# === WebSocket Manager ===
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[INFO] WebSocket connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"[INFO] WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"[WARN] Broadcast failed: {e}")
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

# === WebSocket Endpoint ===
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "SUBSCRIBE":
                    await websocket.send_json({
                        "type": "SUBSCRIBE_ACK",
                        "payload": {"status": "ok", "zones": msg.get("payload", {}).get("zones")}
                    })
                elif msg.get("type") == "PING":
                    await websocket.send_json({"type": "PONG"})   # FIX #16: respond to heartbeat
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[WARN] WebSocket error: {e}")
        manager.disconnect(websocket)

# === Shared: build + broadcast incident from classification result ===
async def _build_and_broadcast_incident(result: dict) -> dict | None:
    severity   = (result.get("severity") or "LOW").upper()
    sound_type = result.get("top_class", "unknown")
# Normalise vehicle family to one debounce key so vehicle/vehicle_alert/
# vehicle_crash all share the same cooldown bucket
    DEBOUNCE_FAMILY = {
        'vehicle_alert': 'vehicle_family',
        'vehicle_crash': 'vehicle_family',
        'car_alarm':     'vehicle_family',
    }
    debounce_key = DEBOUNCE_FAMILY.get(sound_type, sound_type)

    # FIX #17: Only broadcast MEDIUM and above — LOW is LOG_ONLY per spec.
    if severity not in BROADCAST_SEVERITIES:
        print(f"[LOG_ONLY] {sound_type} @ {severity} — below broadcast threshold")
        return None

    # FIX #18: Debounce — skip if this sound_type was broadcast recently.
    now = time.time()
    last = _last_broadcast.get(debounce_key, 0)
    if now - last < DEBOUNCE_SECONDS:
        remaining = round(DEBOUNCE_SECONDS - (now - last), 1)
        print(f"[DEBOUNCE] {sound_type} suppressed — {remaining}s remaining")
        return None
    _last_broadcast[debounce_key] = now

    # FIX #19: uuid4 instead of deprecated asyncio.get_event_loop().time()
    incident_id = f"inc_{uuid4().hex[:8]}"
    incident = {
        "id":                   incident_id,
        "sound_type":           sound_type,
        "confidence":           result.get("confidence", 0),
        "severity":             severity,
        "recommended_response": result.get("recommended_response", ["Dispatcher Review"]),
        "status":               "OPEN",
        "timestamp":            datetime.utcnow().isoformat() + "Z",
        "location": {
            "zone":        "Audio Classifier",
            "description": "Classified from live microphone",
            "lat":         result.get("lat"),
            "lng":         result.get("lng"),
        },
        "volunteers_notified": 0,
        "sensor_id":           "web-classifier",
    }
    print(f"[ALERT] Broadcasting: {sound_type} ({severity}) → {incident_id}")
    await manager.broadcast({"type": "NEW_INCIDENT", "payload": incident})
    return incident

# === /classify — uploaded WAV/audio file ===
@app.post("/classify")
async def handle_classify(file: UploadFile = File(...)):
    """Classify an uploaded audio file and broadcast a NEW_INCIDENT if threshold exceeded."""
    try:
        result = await real_classify(file)
        print(f"[INFO] Classified: {result.get('top_class')} ({result.get('confidence'):.2%})")
        incident = await _build_and_broadcast_incident(result)
        return {
            **result,
            "incident_id":      incident["id"] if incident else None,
            "incident_created": incident is not None,
        }
    except Exception as e:
        print(f"[ERROR] /classify error: {e}")
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")


# ============================================================
# FIX 3: /classify-live — the missing live microphone endpoint
#
# The document (Section 5.2) specifies that browser MediaRecorder
# chunks are POSTed to /classify-live, where ffmpeg converts them
# from WebM/Ogg to 16kHz mono WAV before YAMNet classification.
# This endpoint was completely absent from main.py, causing every
# live-mode chunk to POST to a 404 and silently fail — no alert
# was ever broadcast regardless of how loud the microphone was.
# ============================================================
@app.post("/classify-live")
async def classify_live(file: UploadFile = File(...)):
    """
    Accept a browser MediaRecorder chunk (WebM/Ogg/MP4),
    convert to 16kHz mono WAV via ffmpeg, classify with YAMNet,
    and broadcast a NEW_INCIDENT if a watched class exceeds threshold.
    """
    tmp_input = None
    tmp_wav = None
    try:
        # Write the incoming chunk to a temp file
        raw_bytes = await file.read()
        if not raw_bytes:
            raise HTTPException(status_code=400, detail="Empty audio chunk received")

        suffix = _infer_suffix(file.filename or file.content_type or "")
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(raw_bytes)
            tmp_input = f.name

        # Convert to 16kHz mono WAV using ffmpeg
        tmp_wav = tmp_input + "_converted.wav"
        
        ffmpeg_bin = "ffmpeg"
        if sys.platform == "win32":
            # Attempt to find winget's ffmpeg installation path
            import glob
            winget_path = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages", "*FFmpeg*", "**", "bin", "ffmpeg.exe")
            matches = glob.glob(winget_path, recursive=True)
            if matches:
                ffmpeg_bin = matches[0]
                
        ffmpeg_cmd = [
            ffmpeg_bin, "-y",
            "-i", tmp_input,
            "-ar", "16000",   # 16kHz — required by YAMNet
            "-ac", "1",       # mono
            "-f", "wav",
            tmp_wav
        ]
        
        try:
            proc = subprocess.run(
                ffmpeg_cmd,
                capture_output=True,
                timeout=10        # fail fast if ffmpeg hangs
            )
            if proc.returncode != 0:
                err = proc.stderr.decode(errors="replace")
                print(f"[ERROR] ffmpeg conversion failed:\n{err}")
                raise HTTPException(status_code=500, detail=f"Audio conversion failed: {err[:200]}")

            # FIX 5: Read the entire WAV into memory BEFORE constructing _FakeUpload.
            with open(tmp_wav, "rb") as _f:
                wav_bytes = _f.read()
        except FileNotFoundError:
            print("[WARN] ffmpeg not found! Bypassing conversion for demo mode.")
            wav_bytes = raw_bytes

        class _FakeUpload:
            filename     = "live_chunk.wav"
            content_type = "audio/wav"
            async def read(self):
                return wav_bytes

        result = await real_classify(_FakeUpload(), is_live=True)

        print(f"[LIVE] Classified: {result.get('top_class')} "
              f"({result.get('confidence', 0):.2%}) [{result.get('severity')}]")

        # Guarantee all_classes is always a list so ClassificationBars never
        # gets an empty array and shows "Waiting for audio input".
        # If the classifier returned no array (low-energy / silence), synthesise
        # a single entry from top_class so the bars always update.
        all_classes = result.get("all_classes") or []
        if not all_classes and result.get("top_class"):
            all_classes = [{
                "class":          result["top_class"],
                "sentinel_label": result["top_class"],
                "confidence":     result.get("confidence", 0),
                "severity":       result.get("severity", "LOW"),
            }]

        incident = await _build_and_broadcast_incident(result)

        return {
            **result,
            "all_classes":      all_classes,
            "incident_id":      incident["id"] if incident else None,
            "incident_created": incident is not None,
            "source":           "live_microphone",
        }

    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="ffmpeg timed out processing audio chunk")
    except Exception as e:
        print(f"[ERROR] /classify-live error: {e}")
        raise HTTPException(status_code=500, detail=f"Live classification failed: {str(e)}")
    finally:
        # Always clean up temp files
        for path in (tmp_input, tmp_wav):
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except OSError:
                    pass


def _infer_suffix(hint: str) -> str:
    """Pick a file extension ffmpeg can identify from MIME type or filename."""
    hint = hint.lower()
    if "ogg" in hint:
        return ".ogg"
    if "mp4" in hint:
        return ".mp4"
    if "mpeg" in hint or "mp3" in hint:
        return ".mp3"
    return ".webm"   # default — most browsers emit WebM


# === /incidents — manual incident creation from simulator ===
@app.post("/incidents")
async def create_incident(data: dict):
    incident_id = data.get("id", f"inc_{uuid4().hex[:8]}")   # FIX #19
    sound_type  = data.get("sound_type", "unknown")
    zone        = data.get("location", {}).get("zone", "unknown")
    print(f"[ALERT] New incident: {sound_type} at {zone} [{incident_id}]")
    await manager.broadcast({"type": "NEW_INCIDENT", "payload": {**data, "id": incident_id}})
    return {"status": "created", "id": incident_id}

# === /stats ===
@app.get("/stats")
async def get_stats():
    return {
        "incidents_today": 4,
        "active_incidents": 1,
        "avg_volunteer_response_s": 94,
        "volunteers_active": 12,
        "model_status": "loaded" if model_loaded else "loading" if CLASSIFIER_AVAILABLE else "mock"
    }

# === /incidents/{id} ===
@app.get("/incidents/{incident_id}")
async def get_incident(incident_id: str):
    return {"id": incident_id, "mock": True, "note": "Implement SQLite query in models.py"}

# === FIX C: PATCH /incidents/{id}/status ===
# Dashboard.handleResolveIncident POATCHes here to mark an incident resolved.
# This endpoint was completely missing — every resolve attempt fell into the
# catch block. The optimistic fallback still worked visually (custom event
# updated useWebSocket state), but the backend never acknowledged the change
# and the WebSocket broadcast below means ALL connected dashboards update
# consistently, not just the one that clicked Resolve.
@app.patch("/incidents/{incident_id}/status")
async def update_incident_status(incident_id: str, data: dict):
    new_status = data.get("status", "RESOLVED").upper()
    print(f"[INFO] Incident {incident_id} marked as {new_status}")

    # Broadcast the status change to all connected dashboards so every
    # dispatcher sees the update without a page refresh.
    await manager.broadcast({
        "type": "INCIDENT_UPDATE",
        "payload": {"id": incident_id, "status": new_status}
    })

    return {"id": incident_id, "status": new_status, "updated": True}

# === /volunteers ===
@app.get("/volunteers")
async def list_volunteers():
    return [
        {"id": "vol_001", "name": "Ravi S.", "status": "ACTIVE", "lat": 1.3521, "lng": 103.8198},
        {"id": "vol_002", "name": "Sarah L.", "status": "ACTIVE", "lat": 1.3530, "lng": 103.8200},
    ]

# === Run Server ===
if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("  SENTINEL API - HTTP MODE")
    print("=" * 50)
    print("  Starting on http://localhost:8000")
    print("  Docs: http://localhost:8000/docs")
    print("  Health: http://localhost:8000/health")
    print("=" * 50)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, log_level="info")