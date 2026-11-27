# SENTINEL

SENTINEL is a community-safety hackathon prototype. It classifies sounds with YAMNet and displays potential incidents on a dashboard where volunteers can review and respond to alerts.

## What it demonstrates

- Classifies audio files and live microphone input.
- Streams incident updates to a React dashboard over WebSockets.
- Displays incident locations and severity, with tools for volunteer coordination and false-alarm feedback.
- Includes a Raspberry Pi sensor prototype and a simulator for demos.

The browser classifier sends audio clips to the configured backend for inference. If the backend cannot import the classifier, it uses mock results for the demo. Use SENTINEL as a prototype for local demonstrations.

## Run locally

Install Python 3.11, Node.js with npm, and FFmpeg. Make sure `ffmpeg` is on your PATH.

From the repository root, run the backend in one terminal:

```sh
cd SENTINEL/backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

From the repository root, run the frontend in a second terminal:

```sh
cd SENTINEL/frontend
npm ci
npm start
```

Open the [dashboard](http://localhost:3000) and use **Audio Classifier** to try a sample from the test bench. The [FastAPI documentation](http://localhost:8000/docs) lists the endpoints exposed by the running backend.

## Repository guide

| Path | Contents |
| --- | --- |
| [Backend](SENTINEL/backend/) | FastAPI routes, YAMNet classification, and WebSockets |
| [Frontend](SENTINEL/frontend/) | React dashboard, audio classifier, maps, and volunteer interface |
| [Edge sensor](SENTINEL/edge/) | Raspberry Pi sensor prototype |
| [Testing guide](SENTINEL/testbench/TESTING_GUIDE.md) | Demo and evaluation steps |
