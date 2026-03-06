import React, { useState, useEffect } from "react";

/**
 * IncidentCard — Compact incident summary card
 *
 * FIX #12: Removed debug React.useEffect that logged the entire incident
 *   object (including keys and type checks) on every prop change. With
 *   WebSocket messages arriving every second during live mode this was
 *   causing measurable slowdown and console spam.
 *
 * FIX #13: elapsedTime initialised inline so the card never shows a blank
 *   time field during the first animation frame.
 *
 * FIX #14: confidence bar and text hidden when confidence is 0 or missing —
 *   previously showed "0% confidence" with an empty bar, which looked broken
 *   for live mic chunks that didn't cross the classification threshold.
 */

function computeElapsed(timestamp) {
  if (!timestamp) return "";
  const diffMins = Math.floor((Date.now() - new Date(timestamp)) / 60000);
  if (diffMins < 1)  return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
}

export default function IncidentCard({ incident, isNew = false, onClick, onResolve, onNotes }) {
  // FIX #13: initialise inline so first render always has a value
  const [elapsedTime, setElapsedTime] = useState(() => computeElapsed(incident?.timestamp));

  useEffect(() => {
    setElapsedTime(computeElapsed(incident?.timestamp));
    const interval = setInterval(
      () => setElapsedTime(computeElapsed(incident?.timestamp)),
      60_000
    );
    return () => clearInterval(interval);
  }, [incident?.timestamp]);

  if (!incident) return null;

  const severity   = incident.severity?.toUpperCase?.() || "LOW";
  const soundType  = incident.sound_type || incident.type || "Unknown";
  const location   = incident.location?.description || incident.location || "Unknown location";
  const status     = incident.status?.toUpperCase?.() || "OPEN";
  const confidence = incident.confidence ? Math.round(incident.confidence * 100) : 0;

  const severityColors = {
    CRITICAL: "#dc2626",
    HIGH:     "#ea580c",
    MEDIUM:   "#eab308",
    LOW:      "#059669",
  };

  const severityBgColors = {
    CRITICAL: "#fef2f2",
    HIGH:     "#fff7ed",
    MEDIUM:   "#fefce8",
    LOW:      "#ecfdf5",
  };

  const severityIcons = {
    CRITICAL: "💀",
    HIGH:     "⚠️",
    MEDIUM:   "⚡",
    LOW:      "ℹ️",
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 85) return "#10b981";
    if (conf >= 70) return "#f59e0b";
    return "#eab308";
  };

  const handleResolveClick = (e) => { e.stopPropagation(); onResolve?.(incident.id); };
  const handleNotesClick   = (e) => { e.stopPropagation(); onNotes?.(incident.id);   };

  return (
    <div
      className={`incident-card incident-card-${severity.toLowerCase()} ${isNew ? "incident-card-new" : ""} ${severity === "CRITICAL" ? "critical-alert-border" : ""}`}
      onClick={onClick}
      style={{ borderLeftColor: severityColors[severity] }}
    >
      <div className="incident-header">
        <div className="incident-title" style={{ color: severityColors[severity] }}>
          <span>{severityIcons[severity]}</span>
          <span>{formatSoundType(soundType)}</span>
        </div>
        <span
          className="status-badge"
          style={{
            backgroundColor: severityBgColors[severity],
            color:            severityColors[severity],
            border:           `1px solid ${severityColors[severity]}30`,
          }}
        >
          {severity}
        </span>
      </div>

      <div className="incident-meta">
        <div className="incident-location">📍 {location}</div>
        {elapsedTime && <div className="incident-time">🕐 {elapsedTime}</div>}
      </div>

      {/* FIX #14: only render confidence bar when confidence > 0 */}
      {confidence > 0 && (
        <>
          <div className="confidence-bar">
            <div
              className="confidence-fill"
              style={{
                width:      `${confidence}%`,
                background: `linear-gradient(90deg, ${getConfidenceColor(confidence)} 0%, #10b981 100%)`,
              }}
            />
          </div>
          <div className="confidence-text">{confidence}% confidence</div>
        </>
      )}

      {incident.recommended_response?.length > 0 && (
        <div className="recommended-response">
          <small>Recommended Response</small>
          <div className="response-tags">
            {incident.recommended_response.slice(0, 3).map((r, i) => (
              <span key={i} className="response-tag">
                {typeof r === "string" ? r : String(r)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="incident-actions">
        {status !== "RESOLVED" ? (
          <>
            <button className="btn btn-success btn-sm" onClick={handleResolveClick} title="Mark as resolved">
              ✓ Resolve
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleNotesClick} title="Add notes">
              📝 Notes
            </button>
          </>
        ) : (
          <span className="resolved-badge">✓ Resolved</span>
        )}
      </div>

      {incident.volunteers_notified > 0 && (
        <div className="volunteer-info">
          <small>👥 {incident.volunteers_notified} volunteer(s) notified</small>
        </div>
      )}
    </div>
  );
}

function formatSoundType(type) {
  if (!type) return "Unknown";
  return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}