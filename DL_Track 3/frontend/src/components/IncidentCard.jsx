import React from "react";

/**
 * IncidentCard — Spec Section 4.4 & 10.4
 * Compact summary card for a single incident with severity color coding.
 * New cards animate in with slam animation.
 */

export default function IncidentCard({ incident, isNew = false, onClick, onResolve }) {
  if (!incident) return null;

  const severity = incident.severity?.toUpperCase?.() || "LOW";
  const soundType = incident.sound_type || incident.type || "Unknown";
  const location = incident.location?.description || incident.location || "Unknown location";
  const timestamp = incident.timestamp ? new Date(incident.timestamp).toLocaleTimeString() : "Just now";
  const status = incident.status?.toUpperCase?.() || "OPEN";
  const confidence = incident.confidence ? Math.round(incident.confidence * 100) : 0;

  const severityColors = {
    CRITICAL: "#FF3B5C",
    HIGH: "#FF8C00",
    MEDIUM: "#FFD600",
    LOW: "#00BB66",
  };

  const severityIcons = {
    CRITICAL: "💀",
    HIGH: "⚠️",
    MEDIUM: "⚡",
    LOW: "ℹ️",
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 85) return "#FF3B5C";
    if (conf >= 70) return "#FF8C00";
    if (conf >= 55) return "#FFD600";
    return "#00BB66";
  };

  return (
    <div 
      className={`incident-card incident-card-${severity.toLowerCase()} ${isNew ? "incident-card-new" : ""}`}
      onClick={onClick}
      style={{ borderLeftColor: severityColors[severity] }}
    >
      <div className="incident-header">
        <div className="incident-title" style={{ color: severityColors[severity] }}>
          <span>{severityIcons[severity]}</span>
          <span>{formatSoundType(soundType)}</span>
        </div>
        <span className="status-badge" style={{ 
          backgroundColor: severityColors[severity],
          color: "white"
        }}>
          {severity}
        </span>
      </div>

      <div className="incident-meta">
        <div className="incident-location">📍 {location}</div>
        <div className="incident-time">🕐 {timestamp}</div>
      </div>

      {/* Confidence bar (Spec Section 10.3) */}
      <div className="confidence-bar">
        <div 
          className="confidence-fill"
          style={{ 
            width: `${confidence}%`,
            backgroundColor: getConfidenceColor(confidence)
          }}
        />
      </div>
      <div className="confidence-text">{confidence}% confidence</div>

      {/* Recommended response */}
      {incident.recommended_response && incident.recommended_response.length > 0 && (
        <div className="recommended-response">
          <small>Recommended:</small>
          <div className="response-tags">
            {incident.recommended_response.slice(0, 2).map((r, i) => (
              <span key={i} className="response-tag">{r}</span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="incident-actions">
        {status !== "RESOLVED" && (
          <>
            <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); onResolve?.(); }}>
              ✓ Resolve
            </button>
            <button className="btn btn-outline" onClick={(e) => { e.stopPropagation(); }}>
              📝 Notes
            </button>
          </>
        )}
        {status === "RESOLVED" && (
          <span className="resolved-badge">✓ Resolved</span>
        )}
      </div>

      {/* Volunteer info */}
      {incident.volunteers_notified > 0 && (
        <div className="volunteer-info">
          <small>👥 {incident.volunteers_notified} volunteer(s) notified</small>
        </div>
      )}
    </div>
  );
}

function formatSoundType(type) {
  return type
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
