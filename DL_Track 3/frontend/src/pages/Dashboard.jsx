// src/pages/Dashboard.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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

// Use HTTP backend on port 8000
const API_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws";

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { incidents, volunteers, stats, connected } = useWebSocket(WS_URL);
  const wsRef = useRef(null);
  const { position: myLocation, error: geoError, permission } = useGeolocation();

  // DEBUG: Log what we receive in navigation state
  useEffect(() => {
    console.log("Dashboard received location.state:", location.state);
    if (location.state?.focusIncident) {
      console.log("FOCUS INCIDENT DATA:", location.state.focusIncident);
      console.log("Severity:", location.state.focusIncident.severity);
      console.log("Type:", location.state.focusIncident.sound_type || location.state.focusIncident.type);
    }
  }, [location.state]);

  // Initialize selectedIncident from navigation state IMMEDIATELY
  const [selectedIncident, setSelectedIncident] = useState(() => {
    const incident = location.state?.focusIncident || null;
    if (incident) {
      console.log("INITIALIZING with incident:", incident);
    }
    return incident;
  });
  
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

  // Get focus incident for map
  const focusIncidentForMap = React.useMemo(() => {
    console.log('');
    console.log('🔵 ==============================================');
    console.log('🔵 DASHBOARD CHECKING FOR FOCUS INCIDENT');
    console.log('🔵 ==============================================');
    console.log('🔵 location.state:', location.state);
    console.log('');
    
    // First priority: complete incident object passed in state
    if (location.state?.focusIncident) {
      const incident = location.state.focusIncident;
      console.log('🔵 ✅ Received focusIncident from navigation state');
      console.log('🔵 Full incident object:', JSON.stringify(incident, null, 2));
      console.log('🔵 Incident keys:', Object.keys(incident || {}));
      console.log('🔵 severity field:', incident.severity || incident.severity_level || 'NOT FOUND');
      console.log('🔵 sound_type field:', incident.sound_type || incident.type || 'NOT FOUND');
      console.log('🔵 location field:', incident.location || 'NOT FOUND');
      console.log('');
      return incident;
    }

    // Second priority: find by ID in live data
    const focusId = location.state?.focusIncidentId;
    if (focusId) {
      const found = liveIncidents.find(inc => String(inc.id) === String(focusId));
      if (found) {
        console.log('🔵 ✅ Found incident by ID in liveIncidents');
        console.log('🔵 focusIncidentId:', focusId);
        console.log('🔵 Found incident:', JSON.stringify(found, null, 2));
        console.log('');
        return found;
      } else {
        console.log('🔵 ❌ No incident found with ID:', focusId);
        console.log('🔵 Available incident IDs:', liveIncidents.map(i => i.id));
        console.log('');
      }
    }
    
    console.log('🔵 ❌ No focus incident in state or ID');
    console.log('');
    return null;
  }, [location.state, liveIncidents]);

  // Trigger critical flash IMMEDIATELY with STRONG VISUAL CUES
  useEffect(() => {
    const incident = focusIncidentForMap || selectedIncident;
    if (incident?.severity === "CRITICAL") {
      console.log("🚨🚨🚨 CRITICAL INCIDENT DETECTED! 🚨🚨🚨");
      setIsCriticalFlash(true);
      
      // Make it pulse repeatedly
      const interval = setInterval(() => {
        setIsCriticalFlash(prev => !prev);
      }, 800);
      
      // Stop after 5 seconds
      setTimeout(() => {
        clearInterval(interval);
        setIsCriticalFlash(false);
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [focusIncidentForMap, selectedIncident]);

  // Also trigger on existing critical incidents
  useEffect(() => {
    if (!focusIncidentForMap && !selectedIncident && liveIncidents.length > 0) {
      const criticalIncident = liveIncidents.find(inc => inc.severity === "CRITICAL");
      if (criticalIncident) {
        console.log("Found critical incident in live data:", criticalIncident);
        setSelectedIncident(criticalIncident);
      }
    }
  }, [liveIncidents, focusIncidentForMap, selectedIncident]);

  // Get WebSocket connection
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

  // Debug geolocation
  useEffect(() => {
    if (geoError) console.warn("[Geo] error:", geoError.message);
    if (permission) console.log("[Geo] permission:", permission);
    if (myLocation) console.log("[Geo] position:", myLocation);
  }, [geoError, permission, myLocation]);

  const handleLiveAudio = async (audioData, analyser) => {
    if (audioData) {
      try {
        const formData = new FormData();
        formData.append("file", audioData, "chunk.webm");

        const res = await fetch(`${API_URL}/classify`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          // Ensure we get an array, handle both top5 and all_classes formats
          let scores = data.top5 || data.all_classes || [];
          // If it's an object (not array), convert to array
          if (scores && typeof scores === 'object' && !Array.isArray(scores)) {
            scores = Object.values(scores);
          }
          // Ensure it's an array of objects with proper structure
          if (Array.isArray(scores)) {
            setClassificationScores(scores.map(s => ({
              label: s.label || s.class || s.sentinel_label || 'Unknown',
              confidence: s.confidence || s.score || 0,
              score: s.score || s.confidence || 0,
              severity: s.severity || 'LOW',
              sentinel_label: s.sentinel_label || s.label || s.class
            })));
          } else {
            setClassificationScores([]);
          }
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

  const handleResolveIncident = async (incidentId) => {
    console.log("🔴 Resolving incident:", incidentId);

    try {
      // Try API call first
      const response = await fetch(`${API_URL}/incidents/${incidentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });

      if (response.ok) {
        console.log(`[Incident ${incidentId}] Marked as RESOLVED via API`);

        // Update the incidents array from WebSocket by using a custom event
        // This will trigger the AlertFeed to re-render with updated status
        const resolveEvent = new CustomEvent('incident-resolved', { detail: { incidentId } });
        window.dispatchEvent(resolveEvent);

        // Update local state
        setSelectedIncident((prev) =>
          prev && prev.id === incidentId ? { ...prev, status: "RESOLVED" } : prev
        );

        // Close the popup/panel after resolution
        setTimeout(() => {
          setSelectedIncident(null);
        }, 1000);

      } else {
        console.error("API failed, using fallback");
        // Fallback for demo
        const resolveEvent = new CustomEvent('incident-resolved', { detail: { incidentId } });
        window.dispatchEvent(resolveEvent);

        setSelectedIncident((prev) =>
          prev && prev.id === incidentId ? { ...prev, status: "RESOLVED" } : prev
        );
        setTimeout(() => {
          setSelectedIncident(null);
        }, 1000);
      }
    } catch (err) {
      console.error("Resolve error:", err);
      // Optimistic update for demo
      const resolveEvent = new CustomEvent('incident-resolved', { detail: { incidentId } });
      window.dispatchEvent(resolveEvent);

      setSelectedIncident((prev) =>
        prev && prev.id === incidentId ? { ...prev, status: "RESOLVED" } : prev
      );
      setTimeout(() => {
        setSelectedIncident(null);
      }, 1000);
    }
  };

  const handleNotesClick = (incidentId) => {
    setSelectedIncidentForNotes(incidentId);
    setShowNotesModal(true);
  };

  const handleSaveNote = (note) => {
    console.log("[Note saved]", note);
  };

  const handleBroadcastAnnouncement = () => {
    setShowBroadcastModal(true);
  };

  const handleSendBroadcast = (broadcastData) => {
    console.log("[Broadcast sent]", broadcastData);
  };

  const handleVolunteerClick = (volunteer) => {
    if (volunteer && volunteer.type === "broadcast") {
      setShowBroadcastModal(true);
    } else if (volunteer) {
      setSelectedVolunteer(volunteer);
      setShowVolunteerModal(true);
    }
  };

  const handleViewAllVolunteers = () => {
    setShowAllVolunteersModal(true);
  };

  const handlePingVolunteer = async (volunteerId) => {
    try {
      const response = await fetch(`${API_URL}/volunteers/${volunteerId}/respond`, {
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
    }
  };

  // Determine if we have a critical incident
  const criticalIncident = focusIncidentForMap?.severity === "CRITICAL" || selectedIncident?.severity === "CRITICAL";

  return (
    <div
      className={`app-container ${isCriticalFlash ? "dashboard-critical" : ""}`}
      id="dashboard-root"
    >
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
              focusIncident={focusIncidentForMap}
            />
          </div>

          {/* Incident Detail Panel */}
          {selectedIncident && (
            <div className="incident-detail-panel">
              <div className="detail-header">
                <h3>
                  {selectedIncident.severity === "CRITICAL" && "🚨 "}
                  {selectedIncident.sound_type || selectedIncident.type}
                  {selectedIncident.severity === "CRITICAL" && " 🚨"}
                </h3>
                <button onClick={() => setSelectedIncident(null)}>✕</button>
              </div>
              <div className="detail-content">
                <p>
                  <strong>Type:</strong> {selectedIncident.sound_type || selectedIncident.type}
                </p>
                <p>
                  <strong>Severity:</strong>{" "}
                  <span style={{
                    color: getSeverityColor(selectedIncident.severity),
                    fontWeight: 700
                  }}>
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
                  <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
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