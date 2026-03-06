# SENTINEL - Community Safety Intelligence Platform

**Acoustic Sentinel Network + Bystander Coordination Protocol**

A privacy-preserving public safety system that combines a mesh of acoustic sensors with an automated bystander coordination layer. Detects safety-relevant sound events in real-time and closes the last-mile response gap by alerting trained community volunteers before emergency services arrive.

## 🚀 Quick Start

### System Dependencies
- **ffmpeg**: Required for live audio classification to convert browser audio to the correct format for the YAMNet model.
  - **Windows**: `winget install ffmpeg`
  - **macOS**: `brew install ffmpeg`
  - **Linux**: `sudo apt install ffmpeg`

### Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend will be available at: http://localhost:8000
API Docs: http://localhost:8000/docs

### Frontend (React)

```bash
cd frontend
npm install
npm start
```

Frontend will be available at: http://localhost:3000

## 📁 Project Structure

```
DL_Track 3/
├── backend/
│   ├── main.py              # FastAPI app, WebSocket manager, routes
│   ├── classifier.py        # YAMNet wrapper — POST /classify
│   ├── simulator.py         # Fires fake incidents for demo
│   ├── models.py            # SQLite schema + Pydantic models
│   ├── volunteer_notify.py  # Volunteer query + notification logic
│   ├── event_window.py      # Layer 1: Rolling window classifier
│   ├── sequence_analyser.py # Layer 2: Audio sequence analysis
│   ├── context_scorer.py    # Layer 3: Time/zone context rules
│   ├── corroboration.py     # Layer 4: Multi-sensor corroboration
│   ├── false_alarm_store.py # Layer 5: Negative feedback learning
│   ├── alert_router.py      # Complete decision pipeline
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AlertFeed.jsx
│   │   │   ├── ClassificationBars.jsx
│   │   │   ├── FrequencyRadar.jsx
│   │   │   ├── IncidentCard.jsx
│   │   │   ├── LiveDemoButton.jsx
│   │   │   ├── Map.jsx
│   │   │   ├── VolunteerPanel.jsx
│   │   │   └── WaveformVisualiser.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── VolunteerView.jsx
│   │   │   └── ClassifyTool.jsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.js
│   │   └── mock/
│   │       └── data.js
│   └── package.json
├── testbench/
│   └── TESTING_GUIDE.md     # Step-by-step testing instructions for graders
└── edge/
    └── pi_sensor.py         # Raspberry Pi edge device code
```

## 🔌 API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/stats` | Dashboard statistics |
| GET | `/incidents` | List all incidents |
| GET | `/incidents/{id}` | Get single incident |
| POST | `/incidents` | Create new incident |
| PATCH | `/incidents/{id}/status` | Update incident status |
| POST | `/incidents/{id}/resolve` | Mark incident resolved |
| POST | `/incidents/{id}/false-alarm` | Mark as false alarm |
| GET | `/volunteers` | List all volunteers |
| GET | `/volunteers/{id}` | Get volunteer details |
| POST | `/volunteers/{id}/respond` | Volunteer accept/decline |
| POST | `/classify` | Upload WAV for classification |
| POST | `/classify-live` | Live microphone classification |
| GET | `/sensors` | List registered sensors |
| GET | `/false-alarms/hotspots` | Get false alarm hotspots |
| GET | `/false-alarms/patterns` | Get false alarm patterns |

### WebSocket

**Endpoint:** `ws://localhost:8000/ws`

**Events (Backend → Frontend):**
- `NEW_INCIDENT` — New incident created
- `VOLUNTEER_UPDATE` — Volunteer responded
- `INCIDENT_UPDATE` — Incident status changed
- `STATS_UPDATE` — Dashboard stats (every 30s)

**Events (Frontend → Backend):**
- `SUBSCRIBE` — Subscribe to zone filters

## 🎯 False Positive Reduction (Spec Section 9)

The system implements 5 layers of false positive reduction:

1. **Confidence + Duration Windowing** — 3-second rolling window, 75th percentile scoring
2. **Acoustic Sequence Analysis** — Analyzes follow-on sounds to distinguish accidents from emergencies
3. **Time and Zone Context** — Adjusts thresholds based on time of day and zone type
4. **Multi-Sensor Corroboration** — Boosts confidence when multiple sensors detect same event
5. **Negative Feedback Learning** — Stores false alarm signatures for future suppression

## 🎨 Enhanced UI Features (Spec Section 10)

- **Critical Flash Animation** — Dashboard border flashes red for CRITICAL incidents
- **Slam-in Animation** — New incident cards animate in from the top
- **Pulse-out Map Markers** — Expanding concentric rings on incident markers
- **Live Waveform Visualiser** — Real-time microphone input visualization
- **Classification Confidence Bars** — Top-5 YAMNet results with live updates
- **Acoustic Fingerprint Radar** — Frequency band energy distribution chart
- **LIVE DEMO Mode** — One-click activation for live microphone classification

## 🧪 Demo Script

1. Open dashboard at http://localhost:3000
2. Start simulator: `python backend/simulator.py`
3. Watch alert cards appear in real-time via WebSocket
4. Click incident cards to see details
5. Press **Audio Classifier** and attach an audio of your choice(e.g. Explosion sound(included in the test bench)) to test out the sound system.

A## 🛠️ Tech Stack

**Frontend:**
- React 18 + React Router
- Leaflet.js + React-Leaflet (maps)
- Recharts (radar chart)
- Tailwind CSS

**Backend:**
- Python 3.11+
- FastAPI (async web framework)
- WebSockets (real-time events)
- SQLite (development database)
- YAMNet (audio classification)
- TensorFlow Hub

**Edge:**
- Raspberry Pi Zero 2W
- USB microphone array
- TensorFlow Lite runtime
- MQTT (sensor communication)

## 🔄 Recent Updates

### AlertFeed Component (`frontend/src/components/AlertFeed.jsx`)
- **Filter Logic**: Active filter now explicitly checks for `status === "OPEN"` instead of "not RESOLVED"
- **Status Normalization**: Missing status defaults to `"OPEN"` for consistent handling
- **Empty States**: Context-aware messages per filter tab:
  - "No active incidents" (Active tab)
  - "No resolved incidents" (Resolved tab)
  - "No alerts to display" (All tab)
- **New Incident Highlighting**: Tracks newest incident by ID instead of array index, ensuring correct highlighting across filter changes

### WebSocket Hook (`frontend/src/hooks/useWebSocket.js`)
- **Custom Event Listeners**: Supports `incident-resolved`, `incident-added`, `incident-updated` window events for external state management
- **Exposed `wsRef`**: Returns WebSocket reference for components needing direct connection access (e.g., BroadcastModal)

### Dashboard (`frontend/src/pages/Dashboard.jsx`)
- **WebSocket Integration**: Uses `useWebSocket` hook for real-time incident stream
- **Incident Resolution**: Dispatches custom events to update UI optimistically while API call completes
- **Duplicate Connection Removed**: Single WebSocket connection managed by hook

### HTTPS Setup
- **Certificate Generation**: Run `generate_cert.bat` or `python generate_cert.py` in backend folder
- **HTTPS Configuration**: See `HTTPS_SETUP.md` for detailed SSL/TLS setup instructions
- **Start with HTTPS**: Use `start-https.bat` to launch backend with HTTPS enabled

## 📊 Severity Classification

| Severity | Color | Sound Types | Response |
|----------|-------|-------------|----------|
| CRITICAL | #FF3B5C (Red) | Gunshot, Explosion | Auto-call 999 + SCDF |
| HIGH | #FF8C00 (Orange) | Distress scream, Glass break | Alert volunteers + SCDF |
| MEDIUM | #FFD600 (Yellow) | Impact, Crash | Alert volunteers only |
| LOW | #00BB66 (Green) | Anomalous noise | Dispatcher review |

## 🔒 Privacy Compliance

- **No video** — Audio classification only
- **No recordings stored** — Raw audio never leaves the device
- **No biometric data** — Only classified event labels
- **PDPA compliant** — Singapore personal data protection


