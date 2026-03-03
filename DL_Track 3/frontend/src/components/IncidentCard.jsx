import React, { useState, useEffect } from "react";

/**
 * IncidentCard — Modern Design with Working Buttons
 * Compact summary card for a single incident with severity color coding.
 * New cards animate in with slam animation.
 */

export default function IncidentCard({ incident, isNew = false, onClick, onResolve, onNotes }) {
  const [elapsedTime, setElapsedTime] = useState("");

  // Debug: Log incident structure
  React.useEffect(() => {
    console.log('🔍 IncidentCard received:', incident);
    console.log('🔍 Incident type:', typeof incident);
    console.log('🔍 Incident keys:', incident ? Object.keys(incident) : []);
    if (incident && typeof incident === 'object' && incident.class) {
      console.error('⚠️ WARNING: Incident object has "class" key - this looks like a classification result, not an incident!');
      console.error('⚠️ Full object:', incident);
    }
  }, [incident]);

  // Update elapsed time every minute
  useEffect(() => {
    const updateElapsed = () => {
      if (!incident.timestamp) return;
      
      const now = new Date();
      const incidentTime = new Date(incident.timestamp);
      const diffMs = now - incidentTime;
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) {
        setElapsedTime("Just now");
      } else if (diffMins < 60) {
        setElapsedTime(`${diffMins}m ago`);
      } else {
        const diffHours = Math.floor(diffMins / 60);
        const remainingMins = diffMins % 60;
        if (remainingMins === 0) {
          setElapsedTime(`${diffHours}h ago`);
        } else {
          setElapsedTime(`${diffHours}h ${remainingMins}m ago`);
        }
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 60000);
    return () => clearInterval(interval);
  }, [incident.timestamp]);

  if (!incident) return null;

  const severity = incident.severity?.toUpperCase?.() || "LOW";
  const soundType = incident.sound_type || incident.type || "Unknown";
  const location = incident.location?.description || incident.location || "Unknown location";
  const status = incident.status?.toUpperCase?.() || "OPEN";
  const confidence = incident.confidence ? Math.round(incident.confidence * 100) : 0;

  const severityColors = {
    CRITICAL: "#dc2626",
    HIGH: "#ea580c",
    MEDIUM: "#eab308",
    LOW: "#059669",
  };

  const severityBgColors = {
    CRITICAL: "#fef2f2",
    HIGH: "#fff7ed",
    MEDIUM: "#fefce8",
    LOW: "#ecfdf5",
  };

  const severityIcons = {
    CRITICAL: "💀",
    HIGH: "⚠️",
    MEDIUM: "⚡",
    LOW: "ℹ️",
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 85) return "#10b981";
    if (conf >= 70) return "#f59e0b";
    if (conf >= 55) return "#eab308";
    return "#059669";
  };

  const handleResolveClick = (e) => {
    e.stopPropagation();
    onResolve?.(incident.id);
  };

  const handleNotesClick = (e) => {
    e.stopPropagation();
    onNotes?.(incident.id);
  };

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
            color: severityColors[severity],
            border: `1px solid ${severityColors[severity]}30`
          }}
        >
          {severity}
        </span>
      </div>

      <div className="incident-meta">
        <div className="incident-location">📍 {location}</div>
        <div className="incident-time">🕐 {elapsedTime}</div>
      </div>

      {/* Confidence bar with gradient fill */}
      <div className="confidence-bar">
        <div
          className="confidence-fill"
          style={{
            width: `${confidence}%`,
            background: `linear-gradient(90deg, ${getConfidenceColor(confidence)} 0%, ${confidence >= 70 ? '#10b981' : '#f59e0b'} 100%)`
          }}
        />
      </div>
      <div className="confidence-text">{confidence}% confidence</div>

      {/* Recommended response */}
      {incident.recommended_response && Array.isArray(incident.recommended_response) && incident.recommended_response.length > 0 && (
        <div className="recommended-response">
          <small>Recommended Response</small>
          <div className="response-tags">
            {incident.recommended_response.slice(0, 3).map((r, i) => (
              <span key={i} className="response-tag">{typeof r === 'string' ? r : String(r)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="incident-actions">
        {status !== "RESOLVED" ? (
          <>
            <button 
              className="btn btn-success btn-sm" 
              onClick={handleResolveClick}
              title="Mark as resolved"
            >
              ✓ Resolve
            </button>
            <button 
              className="btn btn-outline btn-sm" 
              onClick={handleNotesClick}
              title="Add notes"
            >
              📝 Notes
            </button>
          </>
        ) : (
          <span className="resolved-badge">
            ✓ Resolved
          </span>
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
  if (!type) return "Unknown";
  return type
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
