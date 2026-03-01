import React from "react";

/**
 * AlertFeed — Section 4.4
 * Displays a live scrolling list of incoming incident alerts via WebSocket.
 */
export default function AlertFeed({ incidents = [] }) {
  return (
    <div className="alert-feed">
      <h2>Live Alerts</h2>
      <ul>
        {incidents.map((incident) => (
          <li key={incident.id}>
            <strong>{incident.type}</strong> — {incident.location} [{incident.severity}]
          </li>
        ))}
      </ul>
    </div>
  );
}
