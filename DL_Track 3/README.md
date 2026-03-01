# SENTINEL 🚨

> AI-powered incident detection and volunteer coordination platform.

## Team


## Project Overview

SENTINEL is a real-time emergency response system that uses audio classification (YAMNet), a Raspberry Pi edge device, and a React + FastAPI stack to detect, classify, and route incidents to nearby volunteers.

## Setup Instructions

### Prerequisites
- Python 3.10+
- Node.js 18+
- Raspberry Pi (for edge module)

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm start
```

### Edge (Raspberry Pi)
```bash
cd edge
pip install -r requirements.txt
python pi_sensor.py
```

## Project Structure

```
sentinel-hackathon/
├── docs/                  # Build spec and documentation
├── frontend/              # React application
├── backend/               # FastAPI application
└── edge/                  # Raspberry Pi sensor code
```
