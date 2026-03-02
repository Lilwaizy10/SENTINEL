// src/pages/Dashboard.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom"; // ADDED: useLocation
import AlertFeed from "../components/AlertFeed";
import Map from "../components/Map";
import VolunteerPanel from "../components/VolunteerPanel";
import WaveformVisualiser from "../components/WaveformVisualiser";
import ClassificationBars from "../components/ClassificationBars";
import FrequencyRadar from "../components/FrequencyRadar";
import LiveDemoButton from "../components/LiveDemoButton";
import NotesModal from "../components/NotesModal";
import BroadcastModal from "../components/BroadcastModal";
import VolunteerModal from "../components/VolunteerModal";
import AllVolunteersModal from "../components/AllVolunteersModal";
import useWebSocket from "../hooks/useWebSocket";
import useGeolocation from "../hooks/useGeolocation";
import { mockIncidents, mockVolunteers, mockStats, mockSensors } from "../mock/data";

/**
 * Dashboard — Main Operator Command View
 * Enhanced with working buttons, modals, and vibrant UI
 */

const WS_URL = "ws://localhost:8000/ws";

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation(); // ADDED: to read navigation state
  const { incidents, volunteers, stats, connected } = useWebSocket(WS_URL);
  const wsRef = useRef(null);

  // Geolocation
  const { position: myLocation, error: geoError, permission } = useGeolocation();

  // State
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [liveMode, setLiveMode] = useState({ active: false, analyser: null, audioContext: null });
  const [classificationScores, setClassificationScores] = useState([]);
  const [isCriticalFlash, setIsCriticalFlash] = useState(false);

  // Modal states
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedIncidentForNotes, setSelectedIncidentForNotes] = useState(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showVolunteerModal, setShowVolunteerModal] = useState(false);
  const [showAllVolunteersModal, setShowAllVolunteersModal] = useState(false);
  const [selectedVolunteer, setSelectedVolunteer] = useState(null);

  // Media refs
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);

  // Use live data or fallback to mock data
  const liveIncidents = incidents.length > 0 ? incidents : mockIncidents;
  const liveVolunteers = volunteers.length > 0 ? volunteers : mockVolunteers;
  const displayStats = stats.incidents_today > 0 ? stats : mockStats;

  // --- NEW: Handle deep-linking from "View on dashboard" button ---
  useEffect(() => {
    // Check if we have an incident ID in navigation state
    const focusId = location.state?.focusIncidentId;
    
    if (focusId) {
      // Find the incident in our data
      const incident = liveIncidents.find(inc => 
        String(inc.id) === String(focusId)
      );
      
      if (incident) {
        // Auto-select it to show details panel
        setSelectedIncident(incident);
        
        // Clear the state so it doesn't re-trigger on re-renders
        // (but keep it in location.state for map to use)
      }
    }
  }, [location.state, liveIncidents]);

  // --- NEW: Get focus incident for map (with coordinates) ---
  const focusIncidentForMap = React.useMemo(() => {
    const focusId = location.state?.focusIncidentId;
    if (!focusId) return null;
    
    return liveIncidents.find(inc => String(inc.id) === String(focusId)) || null;
  }, [location.state, liveIncidents]);

  // Get WebSocket connection for broadcast
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected for broadcasts");
      ws.send(JSON.stringify({
        type: 'SUBSCRIBE',
        payload: { zones: ['all'] }
      }));
    };

    return () => {
      ws.close();
    };
  }, []);

  // Debug geolocation status
  useEffect(() => {
    if (geoError) console.warn("[Geo] error:", geoError.message);
    if (permission) console.log("[Geo] permission:", permission);
    if (myLocation) console.log("[Geo] position:", myLocation);
  }, [geoError, permission, myLocation]);

  // Critical flash animation cue
  useEffect(() => {
    if (liveIncidents.length > 0 && liveIncidents[0].severity === "CRITICAL") {
      setIsCriticalFlash(true);
      const timer = setTimeout(() => setIsCriticalFlash(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [liveIncidents]);

  // Handle live audio classification (unchanged)
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
          setClassificationScores(data.top5 || data.all_classes || []);
        }
      } catch (err) {
        console.error("Classification error:", err);
      }
    }
  };

  const handleActivateLive = (analyser, audioContext, stream) => {
    analyserRef.current = analyser;
    audioContextRef.current = audioContext;
    streamRef.current = stream;

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 128000,
    });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        await handleLiveAudio(event.data, analyser);
      }
    };

    mediaRecorder.start(1000);
    setLiveMode({ active: true, analyser, audioContext });
  };

  const handleDeactivateLive = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    analyserRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;

    setLiveMode({ active: false, analyser: null, audioContext: null });
    setClassificationScores([]);
  };

  // Working Resolve Button
  const handleResolveIncident = async (incidentId) => {
    try {
      const response = await fetch(`http://localhost:8000/incidents/${incidentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });

      if (response.ok) {
        // Update local state to reflect the change
        setSelectedIncident((prev) =>
          prev && prev.id === incidentId ? { ...prev, status: "RESOLVED" } : prev
        );
        console.log(`[Incident ${incidentId}] Marked as RESOLVED`);
      } else {
        console.error("Failed to resolve incident:", response.status);
      }
    } catch (err) {
      console.error("Resolve error:", err);
      // Optimistic update for demo
      setSelectedIncident((prev) =>
        prev && prev.id === incidentId ? { ...prev, status: "RESOLVED" } : prev
      );
    }
  };

  // Working Notes Button
  const handleNotesClick = (incidentId) => {
    setSelectedIncidentForNotes(incidentId);
    setShowNotesModal(true);
  };

  const handleSaveNote = (note) => {
    console.log("[Note saved]", note);
    // Note is persisted in NotesModal component
  };

  // Working Broadcast Announcement
  const handleBroadcastAnnouncement = () => {
    setShowBroadcastModal(true);
  };

  const handleSendBroadcast = (broadcastData) => {
    console.log("[Broadcast sent]", broadcastData);
    // Broadcast is sent in BroadcastModal component
  };

  // Working Volunteer Click Handler
  const handleVolunteerClick = (volunteer) => {
    if (volunteer && volunteer.type === "broadcast") {
      setShowBroadcastModal(true);
    } else if (volunteer) {
      setSelectedVolunteer(volunteer);
      setShowVolunteerModal(true);
    }
  };

  // View All Volunteers Handler
  const handleViewAllVolunteers = () => {
    setShowAllVolunteersModal(true);
  };

  // Working Ping Volunteer
  const handlePingVolunteer = async (volunteerId) => {
    try {
      const response = await fetch(`http://localhost:8000/volunteers/${volunteerId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ping" }),
      });

      if (response.ok) {
        console.log(`[Volunteer ${volunteerId}] Pinged successfully`);
      } else {
        console.warn(`[Volunteer ${volunteerId}] Ping failed, status:`, response.status);
      }
    } catch (err) {
      console.error("Ping error:", err);
      // Optimistic feedback for demo
    }
  };

  return (
    <div className={`app-container ${isCriticalFlash ? "dashboard-critical" : ""}`} id="dashboard-root">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">S</div>
          <h1>SENTINEL — Command Dashboard</h1>
        </div>
        <div className="header-right">
          <button
            className="btn btn-outline"
            onClick={() => navigate("/classify")}
          >
            🎵 Audio Classifier
          </button>
          <div className="connection-status">
            <span className={`status-dot ${connected ? "connected" : "disconnected"}`}></span>
            <span>{connected ? "Connected" : "Disconnected"}</span>
          </div>
          <LiveDemoButton
            onActivate={handleActivateLive}
            onDeactivate={handleDeactivateLive}
            isActive={liveMode.active}
          />
        </div>
      </header>

      {/* Stats Bar with Cards */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-icon">🚨</div>
          <div className="stat-content">
            <div className="stat-value">{displayStats.incidents_today}</div>
            <div className="stat-label">Incidents Today</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <div className="stat-value">{displayStats.active_incidents}</div>
            <div className="stat-label">Active Incidents</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-content">
            <div className="stat-value">{displayStats.avg_volunteer_response_s}s</div>
            <div className="stat-label">Avg Response</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <div className="stat-value">{displayStats.volunteers_active}</div>
            <div className="stat-label">Active Volunteers</div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <main className="dashboard-grid">
        {/* Left Sidebar - Alert Feed */}
        <aside className="sidebar">
          <AlertFeed
            incidents={liveIncidents}
            onSelect={setSelectedIncident}
            onResolve={handleResolveIncident}
            onNotes={handleNotesClick}
          />
        </aside>

        {/* Center Panel - Map + Visualizers */}
        <section className="map-panel">
          {/* Live Demo Visualizers */}
          {liveMode.active && liveMode.analyser && (
            <div className="live-visualizers">
              <WaveformVisualiser analyser={liveMode.analyser} isActive={liveMode.active} />
              <div className="visualizers-row">
                <ClassificationBars scores={classificationScores} />
                <FrequencyRadar analyser={liveMode.analyser} isActive={liveMode.active} />
              </div>
            </div>
          )}

          {/* Map */}
          <div className="map-container">
            <Map
              incidents={liveIncidents}
              volunteers={liveVolunteers}
              sensors={mockSensors}
              myLocation={myLocation}
              focusIncident={focusIncidentForMap} // ADDED: pass focused incident
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
                <p>
                  <strong>Type:</strong> {selectedIncident.sound_type || selectedIncident.type}
                </p>
                <p>
                  <strong>Severity:</strong>{" "}
                  <span style={{ color: getSeverityColor(selectedIncident.severity), fontWeight: 600 }}>
                    {selectedIncident.severity}
                  </span>
                </p>
                <p>
                  <strong>Location:</strong>{" "}
                  {selectedIncident.location?.description || selectedIncident.location}
                </p>
                <p>
                  <strong>Confidence:</strong> {Math.round(selectedIncident.confidence * 100)}%
                </p>
                <p>
                  <strong>Volunteers Notified:</strong> {selectedIncident.volunteers_notified}
                </p>
                <p>
                  <strong>Status:</strong>{" "}
                  <span style={{
                    color: selectedIncident.status === "RESOLVED" ? "#10b981" : "#0ea5e9",
                    fontWeight: 600
                  }}>
                    {selectedIncident.status}
                  </span>
                </p>
                {selectedIncident.status !== "RESOLVED" && (
                  <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleResolveIncident(selectedIncident.id)}
                    >
                      ✓ Mark as Resolved
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleNotesClick(selectedIncident.id)}
                    >
                      📝 Add Note
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right Sidebar - Volunteer Panel */}
        <aside className="volunteer-panel-container">
          <VolunteerPanel
            volunteers={liveVolunteers}
            incidents={liveIncidents}
            onVolunteerClick={handleVolunteerClick}
            onPingVolunteer={handlePingVolunteer}
            onViewAllVolunteers={handleViewAllVolunteers}
          />
        </aside>
      </main>

      {/* Modals */}
      {showNotesModal && selectedIncidentForNotes && (
        <NotesModal
          incidentId={selectedIncidentForNotes}
          onClose={() => {
            setShowNotesModal(false);
            setSelectedIncidentForNotes(null);
          }}
          onSave={handleSaveNote}
        />
      )}

      {showBroadcastModal && (
        <BroadcastModal
          onClose={() => setShowBroadcastModal(false)}
          onSend={handleSendBroadcast}
          wsConnection={wsRef.current}
        />
      )}

      {showVolunteerModal && selectedVolunteer && (
        <VolunteerModal
          volunteer={selectedVolunteer}
          onClose={() => {
            setShowVolunteerModal(false);
            setSelectedVolunteer(null);
          }}
          onPing={handlePingVolunteer}
        />
      )}

      {showAllVolunteersModal && (
        <AllVolunteersModal
          volunteers={liveVolunteers}
          onClose={() => {
            setShowAllVolunteersModal(false);
          }}
          onPingVolunteer={handlePingVolunteer}
        />
      )}
    </div>
  );
}

function getSeverityColor(severity) {
  const colors = {
    CRITICAL: "#dc2626",
    HIGH: "#ea580c",
    MEDIUM: "#eab308",
    LOW: "#059669",
  };
  return colors[severity] || "#64748b";
}