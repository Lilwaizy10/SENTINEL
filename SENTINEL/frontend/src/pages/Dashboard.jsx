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

const API_URL = "http://localhost:8000";
const WS_URL  = "ws://localhost:8000/ws";

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  // FIX 3: useWebSocket already manages one WebSocket connection.
  // The original code also opened a second WebSocket inside a useEffect,
  // creating two competing connections both receiving NEW_INCIDENT events.
  // The second connection has been removed entirely — useWebSocket is
  // the single source of truth for real-time data.
  const { incidents, volunteers, stats, connected } = useWebSocket(WS_URL);

  const { position: myLocation, error: geoError, permission } = useGeolocation();

  const [selectedIncident, setSelectedIncident] = useState(() => {
    return location.state?.focusIncident || null;
  });

  const [liveMode, setLiveMode]                     = useState({ active: false, analyser: null, audioContext: null });
  const [classificationScores, setClassificationScores] = useState([]);
  const [isCriticalFlash, setIsCriticalFlash]       = useState(false);

  // Modal states
  const [showNotesModal,         setShowNotesModal]         = useState(false);
  const [selectedIncidentForNotes, setSelectedIncidentForNotes] = useState(null);
  const [showBroadcastModal,     setShowBroadcastModal]     = useState(false);
  const [showVolunteerModal,     setShowVolunteerModal]     = useState(false);
  const [showAllVolunteersModal, setShowAllVolunteersModal] = useState(false);
  const [selectedVolunteer,      setSelectedVolunteer]      = useState(null);

  // FIX #9: mediaRecorderRef, audioContextRef, analyserRef, streamRef removed —
  // LiveDemoButton owns all recording internals now. These were dead code.

  // FIX #7: keep last known live data so reconnects don't flash an empty feed.
  // Once real data has arrived we never fall back to stale or empty state.
  const lastKnownIncidents  = useRef([]);
  const lastKnownVolunteers = useRef([]);
  const hasLiveDataRef      = useRef(false);

  // ── Unified incident state ────────────────────────────────────────────────
  // ROOT CAUSE OF RESOLVE BUG: mock incidents live in a static const, never in
  // useWebSocket's state. Clicking Resolve dispatched "incident-resolved" which
  // updated useWebSocket's state (empty array) — not the displayed mock data.
  //
  // FIX: one local `displayIncidents` state owns what the feed renders.
  //   • Starts as mockIncidents so the feed is never empty on load.
  //   • Replaced with real data the moment the WebSocket delivers incidents.
  //   • Resolve mutates this state directly → works on both mock and live cards.
  const [displayIncidents, setDisplayIncidents] = useState(mockIncidents);

  // Sync real WebSocket incidents into displayIncidents (one-way: once live, stay live).
  // IMPORTANT: merge resolved statuses from displayIncidents so a WebSocket flush
  // doesn't un-resolve a card the user just clicked.
  useEffect(() => {
    if (incidents.length > 0) {
      hasLiveDataRef.current     = true;
      lastKnownIncidents.current = incidents;
      setDisplayIncidents(prev => {
        const resolvedIds = new Set(
          prev.filter(i => i.status === "RESOLVED").map(i => i.id)
        );
        return incidents.map(inc =>
          resolvedIds.has(inc.id) ? { ...inc, status: "RESOLVED" } : inc
        );
      });
    }
  }, [incidents]);

  // FIX #2: move hasLiveDataRef volunteer mutation here too (incidents handled above)
  useEffect(() => {
    if (volunteers.length > 0) {
      hasLiveDataRef.current      = true;
      lastKnownVolunteers.current = volunteers;
    }
  }, [volunteers]);

  // liveVolunteers: use last known to avoid blank flash on reconnect
  const liveVolunteers = hasLiveDataRef.current
    ? (volunteers.length > 0 ? volunteers : lastKnownVolunteers.current)
    : mockVolunteers;
  const displayStats = stats.incidents_today > 0 ? stats : mockStats;
  // displayIncidents is managed by useState above — used directly in JSX

  // Extract focusIncident from navigation state with validation
  const focusIncidentFromNav = React.useMemo(() => {
    if (!location.state?.focusIncident) {
      return null;
    }
    
    const fi = location.state.focusIncident;
    
    // Validate it has minimum required fields
    if (!fi.id) {
      console.warn('[Dashboard] focusIncident missing id:', fi);
      return null;
    }
    
    // Ensure it has all required fields for rendering
    const validated = {
      id: fi.id,
      sound_type: fi.sound_type || fi.type || 'Unknown',
      severity: fi.severity || 'LOW',
      status: fi.status || 'OPEN',
      confidence: fi.confidence || 0,
      volunteers_notified: fi.volunteers_notified || 0,
      timestamp: fi.timestamp || new Date().toISOString(),
      location: fi.location?.lat && fi.location?.lng ? fi.location : {
        lat: fi.lat || 1.3521,
        lng: fi.lng || 103.8198,
        description: fi.location?.description || 'Unknown location',
        zone: fi.location?.zone || 'Unknown',
      },
      // Preserve all other properties
      ...fi,
    };
    
    return validated;
  }, [location.state]);

  const focusIncidentForMap = focusIncidentFromNav || (
    location.state?.focusIncidentId
      ? displayIncidents.find(inc => String(inc.id) === String(location.state.focusIncidentId)) || null
      : null
  );

  // Inject classifier incident into feed immediately — don't wait for WebSocket
  useEffect(() => {
    if (focusIncidentForMap && focusIncidentForMap.id) {
      setDisplayIncidents(prev => {
        // Check if incident already exists in the feed
        if (prev.find(i => i.id === focusIncidentForMap.id)) return prev;
        // Ensure incident has required fields
        const safeIncident = {
          ...focusIncidentForMap,
          status: focusIncidentForMap.status || 'OPEN',
          volunteers_notified: focusIncidentForMap.volunteers_notified || 0,
        };
        return [safeIncident, ...prev];
      });
      setSelectedIncident(focusIncidentForMap);
    }
  }, [focusIncidentForMap]);

  // Clear location.state after processing (so refresh doesn't re-inject)
  useEffect(() => {
    if (location.state?.focusIncident) {
      // Clear the state after processing so a page refresh doesn't re-inject
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Critical flash
  useEffect(() => {
    const incident = focusIncidentForMap || selectedIncident;
    if (incident?.severity === "CRITICAL") {
      setIsCriticalFlash(true);
      const interval = setInterval(() => setIsCriticalFlash(prev => !prev), 800);
      const timeout  = setTimeout(() => { clearInterval(interval); setIsCriticalFlash(false); }, 5000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, [focusIncidentForMap, selectedIncident]);

  // Auto-pop the active incident panel once per new incident so dispatchers
  // are notified immediately, but can still click "X" to dismiss the panel.
  const lastAutoSelectedId = useRef(null);
  
  useEffect(() => {
    if (displayIncidents.length > 0) {
      const newest = displayIncidents[0]; // Assuming incidents are prepended (newest first)
      if (
        newest.id !== lastAutoSelectedId.current &&
        ["CRITICAL", "HIGH", "MEDIUM"].includes(newest.severity) &&
        newest.status !== "RESOLVED"
      ) {
        setSelectedIncident(newest);
        lastAutoSelectedId.current = newest.id;
      }
    }
  }, [displayIncidents]);

  useEffect(() => {
    if (geoError) console.warn("[Geo] error:", geoError.message);
  }, [geoError]);

  // ── Live audio chunk handler ──────────────────────────────────────────────
  // FIX 1: POSTs to /classify-live (not /classify).
  //   /classify is for uploaded WAV files from the Audio Classifier page.
  //   /classify-live is the endpoint that accepts raw browser MediaRecorder
  //   chunks, runs ffmpeg conversion, and broadcasts NEW_INCIDENT via WebSocket.
  //
  // FIX BUG 2: classifier returns all_classes with shape {class, sentinel_label, confidence}.
  // Normalise every possible key variant so ClassificationBars always gets
  // [{label, confidence, severity, sentinel_label}] regardless of backend version.
  const handleLiveChunk = async (blob) => {
    try {
      const formData = new FormData();
      formData.append("file", blob, "chunk.webm");

      const res = await fetch(`${API_URL}/classify-live`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        console.error(`[classify-live] HTTP ${res.status}`);
        return;
      }

      const data = await res.json();

      // Support both top5 (legacy) and all_classes (current) response keys
      let raw = data.top5 || data.all_classes || [];

      // If it's an object map rather than an array, convert to array
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        raw = Object.values(raw);
      }

      if (!Array.isArray(raw) || raw.length === 0) {
        // Backend may return top_class only with no array — synthesise one entry
        if (data.top_class && data.confidence > 0) {
          raw = [{
            class:          data.top_class,
            sentinel_label: data.top_class,
            confidence:     data.confidence,
            severity:       data.severity || "LOW",
          }];
        } else {
          setClassificationScores([]);
          return;
        }
      }

      setClassificationScores(
        raw.map(s => ({
          // Normalise label: prefer sentinel_label, then label, then class
          label:          s.sentinel_label || s.label || s.class || "Unknown",
          confidence:     s.confidence    ?? s.score  ?? 0,
          score:          s.score         ?? s.confidence ?? 0,
          severity:       s.severity      || "LOW",
          sentinel_label: s.sentinel_label || s.label || s.class || "Unknown",
        }))
      );
    } catch (err) {
      console.error("[classify-live] fetch error:", err);
    }
  };

  // ── Called once when LiveDemoButton successfully acquires mic ─────────────
  // FIX 2: onActivate no longer creates a MediaRecorder — LiveDemoButton
  //   already started one and is calling handleLiveChunk via onChunk.
  //   Dashboard only stores the refs needed for visualisers and cleanup.
  // FIX 4: No hard-coded mimeType here — LiveDemoButton handles MIME selection.
  const handleActivateLive = (analyser, audioContext, stream) => {
    setLiveMode({ active: true, analyser, audioContext });
  };

  const handleDeactivateLive = () => {
    // LiveDemoButton stops its own MediaRecorder and stream tracks.
    // Dashboard only needs to clear its UI state.
    setLiveMode({ active: false, analyser: null, audioContext: null });
    setClassificationScores([]);
  };

  // ── Incident resolution ───────────────────────────────────────────────────
  const handleResolveIncident = async (incidentId) => {
    // Optimistically update displayIncidents immediately — this works for BOTH
    // mock cards (which are never in useWebSocket state) and live cards.
    setDisplayIncidents(prev =>
      prev.map(inc => inc.id === incidentId ? { ...inc, status: "RESOLVED" } : inc)
    );
    setSelectedIncident(prev =>
      prev?.id === incidentId ? { ...prev, status: "RESOLVED" } : prev
    );
    setTimeout(() => setSelectedIncident(null), 1000);

    // Also tell useWebSocket so it stays consistent if a WebSocket flush arrives later
    window.dispatchEvent(new CustomEvent("incident-resolved", { detail: { incidentId } }));

    // Best-effort API call — failure doesn't affect the UI
    try {
      const response = await fetch(`${API_URL}/incidents/${incidentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
      if (!response.ok) console.warn(`[Resolve] API returned ${response.status} for ${incidentId}`);
    } catch (err) {
      console.error("[Resolve] API unreachable:", err.message);
    }
  };

  // ── Modal handlers ────────────────────────────────────────────────────────
  const handleNotesClick  = (incidentId) => { setSelectedIncidentForNotes(incidentId); setShowNotesModal(true); };
  const handleSaveNote    = (note)        => console.log("[Note saved]", note);
  const handleSendBroadcast = (data)      => console.log("[Broadcast sent]", data);

  const handleVolunteerClick = (volunteer) => {
    if (volunteer?.type === "broadcast") {
      setShowBroadcastModal(true);
    } else if (volunteer) {
      setSelectedVolunteer(volunteer);
      setShowVolunteerModal(true);
    }
  };

  const handleViewAllVolunteers = () => setShowAllVolunteersModal(true);

  const handlePingVolunteer = async (volunteerId) => {
    try {
      const response = await fetch(`${API_URL}/volunteers/${volunteerId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ping" }),
      });
      if (!response.ok) console.warn(`[Volunteer ${volunteerId}] Ping failed:`, response.status);
    } catch (err) {
      console.error("Ping error:", err);
    }
  };

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
          <button className="btn btn-outline" onClick={() => navigate("/classify")}>
            🎵 Audio Classifier
          </button>
          <div className="connection-status">
            <span className={`status-dot ${connected ? "connected" : "disconnected"}`} />
            <span>{connected ? "Connected" : "Disconnected"}</span>
          </div>
          {/* FIX 2: onChunk prop added — LiveDemoButton calls this per 1-second chunk */}
          <LiveDemoButton
            onActivate={handleActivateLive}
            onChunk={handleLiveChunk}
            onDeactivate={handleDeactivateLive}
            isActive={liveMode.active}
          />
        </div>
      </header>

      {/* Stats Bar */}
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

      {/* Main Grid */}
      <main className="dashboard-grid">
        <aside className="sidebar">
          <AlertFeed
            incidents={displayIncidents}
            onSelect={setSelectedIncident}
            onResolve={handleResolveIncident}
            onNotes={handleNotesClick}
            connected={connected}
            isLive={hasLiveDataRef.current}          />
        </aside>

        <section className="map-panel">
          {/* Live visuals are now hidden when an incident panel is open */}
          {liveMode.active && liveMode.analyser && !selectedIncident && (
            <div className="live-visualizers">
              <WaveformVisualiser analyser={liveMode.analyser} isActive={liveMode.active} />
              <div className="visualizers-row">
                <ClassificationBars scores={classificationScores} />
                <FrequencyRadar analyser={liveMode.analyser} isActive={liveMode.active} />
              </div>
            </div>
          )}

          <div className="map-container">
            <Map
              incidents={displayIncidents}
              volunteers={liveVolunteers}
              sensors={mockSensors}
              myLocation={myLocation}
              focusIncident={focusIncidentForMap}
            />
          </div>

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
                <p><strong>Type:</strong> {selectedIncident.sound_type || selectedIncident.type}</p>
                <p>
                  <strong>Severity:</strong>{" "}
                  <span style={{ color: getSeverityColor(selectedIncident.severity), fontWeight: 700 }}>
                    {selectedIncident.severity}
                  </span>
                </p>
                <p><strong>Location:</strong> {selectedIncident.location?.description || selectedIncident.location}</p>
                <p><strong>Confidence:</strong> {Math.round(selectedIncident.confidence * 100)}%</p>
                <p><strong>Volunteers Notified:</strong> {selectedIncident.volunteers_notified}</p>
                <p>
                  <strong>Status:</strong>{" "}
                  <span style={{ color: selectedIncident.status === "RESOLVED" ? "#10b981" : "#0ea5e9", fontWeight: 600 }}>
                    {selectedIncident.status}
                  </span>
                </p>
                {selectedIncident.status !== "RESOLVED" && (
                  <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
                    <button className="btn btn-success btn-sm" onClick={() => handleResolveIncident(selectedIncident.id)}>
                      ✓ Mark as Resolved
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => handleNotesClick(selectedIncident.id)}>
                      📝 Add Note
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="volunteer-panel-container">
          <VolunteerPanel
            volunteers={liveVolunteers}
            incidents={displayIncidents}
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
          onClose={() => { setShowNotesModal(false); setSelectedIncidentForNotes(null); }}
          onSave={handleSaveNote}
        />
      )}
      {showBroadcastModal && (
        <BroadcastModal
          onClose={() => setShowBroadcastModal(false)}
          onSend={handleSendBroadcast}
        />
      )}
      {showVolunteerModal && selectedVolunteer && (
        <VolunteerModal
          volunteer={selectedVolunteer}
          onClose={() => { setShowVolunteerModal(false); setSelectedVolunteer(null); }}
          onPing={handlePingVolunteer}
        />
      )}
      {showAllVolunteersModal && (
        <AllVolunteersModal
          volunteers={liveVolunteers}
          onClose={() => setShowAllVolunteersModal(false)}
          onPingVolunteer={handlePingVolunteer}
        />
      )}
    </div>
  );
}

function getSeverityColor(severity) {
  const colors = { CRITICAL: "#dc2626", HIGH: "#ea580c", MEDIUM: "#eab308", LOW: "#059669" };
  return colors[severity] || "#64748b";
}