import React, { useState } from "react";
import IncidentCard from "./IncidentCard";

/**
 * AlertFeed — Live Incident Alerts with Filtering
 * Displays a live scrolling list of incoming incident alerts.
 * New cards animate in with slam animation.
 */

export default function AlertFeed({ incidents = [], onSelect, onResolve, onNotes }) {
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

  // Sort by timestamp (newest first)
  const sortedIncidents = [...filteredIncidents].sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeB - timeA;
  });

  return (
    <div className="sidebar-header">
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

      <div className="alert-feed">
        {sortedIncidents.length === 0 ? (
          <div className="no-alerts">
            <p>No alerts to display</p>
            <small>Waiting for incidents...</small>
          </div>
        ) : (
          sortedIncidents.map((incident, index) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              isNew={index === 0 && filter === "all"}
              onClick={() => onSelect?.(incident)}
              onResolve={(id) => onResolve?.(id)}
              onNotes={(id) => onNotes?.(id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
