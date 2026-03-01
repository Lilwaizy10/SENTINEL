import React from "react";

/**
 * IncidentCard
 * Compact summary card for a single incident.
 */
export default function IncidentCard({ incident }) {
  if (!incident) return null;
  const { type, location, severity, timestamp, status } = incident;

  return (
    <div className="incident-card">
      <h3>{type}</h3>
      <p>📍 {location}</p>
      <p>⚠️ Severity: <strong>{severity}</strong></p>
      <p>🕐 {new Date(timestamp).toLocaleTimeString()}</p>
      <span className={`badge badge-${status}`}>{status}</span>
    </div>
  );
}
