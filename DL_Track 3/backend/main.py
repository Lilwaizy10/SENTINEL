from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio, json, threading
from typing import List, Optional

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
    
    async def real_classify(file):
        """Mock classifier fallback"""
        filename = getattr(file, 'filename', 'unknown').lower()
        
        if 'explosion' in filename or 'gunshot' in filename:
            return {
                'top_class': 'explosion',
                'confidence': 0.89,
                'severity': 'CRITICAL',
                'all_classes': [
                    {'class': 'Explosion', 'confidence': 0.89, 'sentinel_label': 'explosion', 'severity': 'CRITICAL'},
                ],
                'recommended_response': ['Police (999)', 'SCDF (995)', 'SGSecure'],
                'model': 'YAMNet (mock)'
            }
        elif 'scream' in filename:
            return {
                'top_class': 'distress_scream',
                'confidence': 0.87,
                'severity': 'HIGH',
                'all_classes': [
                    {'class': 'Screaming', 'confidence': 0.87, 'sentinel_label': 'distress_scream', 'severity': 'HIGH'},
                ],
                'recommended_response': ['SCDF (995)', 'SGSecure'],
                'model': 'YAMNet (mock)'
            }
        else:
            return {
                'top_class': 'impact_thud',
                'confidence': 0.72,
                'severity': 'MEDIUM',
                'all_classes': [],
                'recommended_response': ['SGSecure'],
                'model': 'YAMNet (mock)'
            }

# === Global State ===
model_loaded = False

# === Lifespan Handler (Modern FastAPI) ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown"""
    global model_loaded
    print("[INFO] Starting SENTINEL backend...")
    
    # Load model in background if available
    if CLASSIFIER_AVAILABLE:
        def load_in_thread():
            global model_loaded
            try:
                load_yamnet_model()
                model_loaded = True
                print("[OK] YAMNet model loaded in background")
            except Exception as e:
                print(f"[WARN] Model load failed: {e}")
        
        thread = threading.Thread(target=load_in_thread, daemon=True)
        thread.start()
    
    yield  # App runs here
    
    print("[INFO] Shutting down SENTINEL backend...")

# === App Initialization ===
app = FastAPI(title='SENTINEL API', lifespan=lifespan)

# CORS - Critical for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Health Check Endpoint ===
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
        """Send message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"[WARN] Broadcast failed to a client: {e}")
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
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[WARN] WebSocket error: {e}")
        manager.disconnect(websocket)

# === Classify Endpoint ===
@app.post("/classify")
async def handle_classify(file: UploadFile = File(...)):
    """Classify uploaded audio file"""
    try:
        result = await real_classify(file)
        print(f"[INFO] Classified: {result.get('top_class')} ({result.get('confidence'):.2%})")
        return result
    except Exception as e:
        print(f"[ERROR] Classification error: {e}")
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")

# === Incidents Endpoint ===
@app.post("/incidents")
async def create_incident(data: dict):
    """Create new incident and broadcast to dashboard"""
    incident_id = data.get('id', f'inc_{asyncio.get_event_loop().time()}')
    sound_type = data.get('sound_type', 'unknown')
    zone = data.get('location', {}).get('zone', 'unknown')
    
    print(f"[ALERT] New incident: {sound_type} at {zone} [{incident_id}]")
    
    await manager.broadcast({
        'type': 'NEW_INCIDENT',
        'payload': {**data, 'id': incident_id}
    })
    
    return {"status": "created", "id": incident_id}

# === Stats Endpoint ===
@app.get("/stats")
async def get_stats():
    """Dashboard summary stats"""
    return {
        "incidents_today": 4,
        "active_incidents": 1,
        "avg_volunteer_response_s": 94,
        "volunteers_active": 12,
        "model_status": "loaded" if model_loaded else "loading" if CLASSIFIER_AVAILABLE else "mock"
    }

# === Incident Detail Endpoint ===
@app.get("/incidents/{incident_id}")
async def get_incident(incident_id: str):
    """Get single incident details"""
    return {
        "id": incident_id,
        "mock": True,
        "note": "Implement SQLite query in models.py"
    }

# === Volunteers Endpoint ===
@app.get("/volunteers")
async def list_volunteers():
    """List available volunteers"""
    return [
        {"id": "vol_001", "name": "Ravi S.", "status": "ACTIVE", "lat": 1.3521, "lng": 103.8198},
        {"id": "vol_002", "name": "Sarah L.", "status": "ACTIVE", "lat": 1.3530, "lng": 103.8200},
    ]

# === Run Server ===
if __name__ == "__main__":
    import uvicorn
    import sys
    
    if sys.platform == "win32":
        try:
            import os
            os.system('chcp 65001 >nul 2>&1')
        except:
            pass
    
    print("Starting SENTINEL API on http://localhost:8000")
    print("Docs: http://localhost:8000/docs")
    print("Health: http://localhost:8000/health")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info"
    )
