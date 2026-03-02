import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AlertFeed from "../components/AlertFeed";
import Map from "../components/Map";
import VolunteerPanel from "../components/VolunteerPanel";
import WaveformVisualiser from "../components/WaveformVisualiser";
import ClassificationBars from "../components/ClassificationBars";
import FrequencyRadar from "../components/FrequencyRadar";
import LiveDemoButton from "../components/LiveDemoButton";
import useWebSocket from "../hooks/useWebSocket";
import { mockIncidents, mockVolunteers, mockStats, mockSensors } from "../mock/data";

/**
 * Dashboard — Spec Section 4.1 & 4.2
 * Main operator view with live map, alert feed, and volunteer panel.
 * 3-panel layout: Left sidebar (alerts), Center (map + visualizers), Right (volunteers)
 */

const WS_URL = "ws://localhost:8000/ws";

export default function Dashboard() {
  const navigate = useNavigate();
  const { incidents, volunteers, stats, connected } = useWebSocket(WS_URL);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [liveMode, setLiveMode] = useState({ active: false, analyser: null, audioContext: null });
  const [classificationScores, setClassificationScores] = useState([]);
  const [isCriticalFlash, setIsCriticalFlash] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);

  // Use live data or fallback to mock data
  const liveIncidents = incidents.length > 0 ? incidents : mockIncidents;
  const liveVolunteers = volunteers.length > 0 ? volunteers : mockVolunteers;
  const displayStats = stats.incidents_today > 0 ? stats : mockStats;

  // Check for critical incidents and trigger flash animation
  useEffect(() => {
    if (liveIncidents.length > 0 && liveIncidents[0].severity === 'CRITICAL') {
      setIsCriticalFlash(true);
      const timer = setTimeout(() => setIsCriticalFlash(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [liveIncidents]);

  // Handle live audio classification
  const handleLiveAudio = async (audioData, analyser) => {
    if (audioData) {
      try {
        const formData = new FormData();
        formData.append("file", audioData, "chunk.webm");

        const res = await fetch("http://localhost:8000/classify", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setClassificationScores(data.top5 || []);
        }
      } catch (err) {
        console.error("Classification error:", err);
      }
    }
  };

  const handleActivateLive = (analyser, audioContext, stream) => {
    // Store refs for cleanup
    analyserRef.current = analyser;
    audioContextRef.current = audioContext;
    streamRef.current = stream;

    // Set up MediaRecorder for 1-second chunks
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000
    });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        await handleLiveAudio(event.data, analyser);
      }
    };

    // Record in 1-second chunks
    mediaRecorder.start(1000);

    setLiveMode({ active: true, analyser, audioContext });
  };

  const handleDeactivateLive = () => {
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    analyserRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;

    setLiveMode({ active: false, analyser: null, audioContext: null });
    setClassificationScores([]);
  };

  const handleResolveIncident = async (incidentId) => {
    try {
      await fetch(`http://localhost:8000/incidents/${incidentId}/resolve`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Resolve error:", err);
    }
  };

  return (
    <div className={`app-container ${isCriticalFlash ? 'dashboard-critical' : ''}`} id="dashboard-root">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">S</div>
          <h1>SENTINEL — Command Dashboard</h1>
        </div>
        <div className="header-right">
          <button 
            className="btn btn-outline" 
            onClick={() => navigate('/classify')}
            style={{ marginRight: '12px' }}
          >
            🎵 Audio Classifier
          </button>
          <div className="connection-status">
            <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
            <span>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <LiveDemoButton
            onActivate={handleActivateLive}
            onDeactivate={handleDeactivateLive}
            isActive={liveMode.active}
          />
        </div>
      </header>

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <div className="stat-value">{displayStats.incidents_today}</div>
          <div className="stat-label">Incidents Today</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{displayStats.active_incidents}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{displayStats.avg_volunteer_response_s}s</div>
          <div className="stat-label">Avg Response</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{displayStats.volunteers_active}</div>
          <div className="stat-label">Volunteers Active</div>
        </div>
      </div>

      {/* Main Dashboard Grid (Spec Section 4.2) */}
      <main className="dashboard-grid">
        {/* Left Sidebar - Alert Feed (Spec Section 4.4) */}
        <aside className="sidebar">
          <AlertFeed
            incidents={liveIncidents}
            onSelect={setSelectedIncident}
            onResolve={handleResolveIncident}
          />
        </aside>

        {/* Center Panel - Map + Visualizers */}
        <section className="map-panel">
          {/* Live Demo Visualizers */}
          {liveMode.active && liveMode.analyser && (
            <div className="live-visualizers">
              <WaveformVisualiser
                analyser={liveMode.analyser}
                isActive={liveMode.active}
              />
              <div className="visualizers-row">
                <ClassificationBars scores={classificationScores} />
                <FrequencyRadar
                  analyser={liveMode.analyser}
                  isActive={liveMode.active}
                />
              </div>
            </div>
          )}

          {/* Map */}
          <div className="map-container">
            <Map
              incidents={liveIncidents}
              volunteers={liveVolunteers}
              sensors={mockSensors}
            />
          </div>

          {/* Incident Detail Panel */}
          {selectedIncident && (
            <div className="incident-detail-panel">
              <div className="detail-header">
                <h3>Incident Details</h3>
                <button onClick={() => setSelectedIncident(null)}>✕</button>
              </div>
              <div className="detail-content">
                <p><strong>Type:</strong> {selectedIncident.sound_type || selectedIncident.type}</p>
                <p><strong>Severity:</strong> {selectedIncident.severity}</p>
                <p><strong>Location:</strong> {selectedIncident.location?.description || selectedIncident.location}</p>
                <p><strong>Confidence:</strong> {Math.round(selectedIncident.confidence * 100)}%</p>
                <p><strong>Volunteers Notified:</strong> {selectedIncident.volunteers_notified}</p>
                <p><strong>Status:</strong> {selectedIncident.status}</p>
              </div>
            </div>
          )}
        </section>

        {/* Right Sidebar - Volunteer Panel (Spec Section 4.4) */}
        <aside className="volunteer-panel-container">
          <VolunteerPanel
            volunteers={liveVolunteers}
            incidents={liveIncidents}
          />
        </aside>
      </main>
    </div>
  );
}
