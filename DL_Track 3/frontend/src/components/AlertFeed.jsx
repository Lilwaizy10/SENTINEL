import React, { useState } from "react";
import IncidentCard from "./IncidentCard";

/**
 * AlertFeed — Spec Section 4.4 & 10.4
 * Displays a live scrolling list of incoming incident alerts via WebSocket.
 * New cards animate in with slam animation. Critical incidents flash the dashboard.
 */

export default function AlertFeed({ incidents = [], onResolve, onSelect }) {
  const [filter, setFilter] = useState("all"); // all | active | resolved

  const filteredIncidents = incidents.filter((inc) => {
    const status = inc.status?.toUpperCase?.() || "OPEN";
    if (filter === "active") {
      return status !== "RESOLVED";
    }
    if (filter === "resolved") {
      return status === "RESOLVED";
    }
    return true;
  });

  return (
    <div className="alert-feed-container">
      <div className="alert-feed-header">
        <h2>🚨 Live Alerts</h2>
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`filter-tab ${filter === "active" ? "active" : ""}`}
            onClick={() => setFilter("active")}
          >
            Active
          </button>
          <button
            className={`filter-tab ${filter === "resolved" ? "active" : ""}`}
            onClick={() => setFilter("resolved")}
          >
            Resolved
          </button>
        </div>
      </div>

      <div className="alert-feed">
        {filteredIncidents.length === 0 ? (
          <div className="no-alerts">
            <p>No alerts</p>
            <small>Waiting for incidents...</small>
          </div>
        ) : (
          filteredIncidents.map((incident, index) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              isNew={index === 0}
              onClick={() => onSelect?.(incident)}
              onResolve={() => onResolve?.(incident.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
