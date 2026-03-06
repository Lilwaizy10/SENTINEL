import React, { useState } from "react";

/**
 * VolunteerPanel — Interactive Volunteer List
 *
 * FIX D: Duplicate object keys for 'en_route' in getStatusBadgeClass,
 *   getStatusIcon, and getStatusLabel. JavaScript silently drops all but
 *   the last definition, which happened to be identical here — functionally
 *   harmless but a latent bug if the values ever diverge. Deduplicated.
 *
 * IMPROVEMENT: availableVolunteers and activeVolunteers filters now also
 *   treat 'ACTIVE' (the status mock data and the /volunteers endpoint return)
 *   so the stat pills show correct counts instead of always zero.
 */

export default function VolunteerPanel({
  volunteers = [],
  incidents = [],
  onVolunteerClick,
  onPingVolunteer,
  onViewAllVolunteers,
}) {
  const [pingingId, setPingingId] = useState(null);

  const getActiveIncidentCount = () =>
    incidents.filter((i) => i.status !== "RESOLVED").length;

  const getStatusBadgeClass = (status) => {
    const classes = {
      available: "status-available",
      active:    "status-available",   // backend uses ACTIVE
      notified:  "status-notified",
      accepted:  "status-accepted",
      en_route:  "status-enroute",     // FIX D: single entry
      declined:  "status-declined",
      offline:   "status-offline",
    };
    return classes[status?.toLowerCase?.()] || "status-notified";
  };

  const getStatusIcon = (status) => {
    const icons = {
      available: "🟢",
      active:    "🟢",
      notified:  "📳",
      accepted:  "✓",
      en_route:  "🚗",                 // FIX D: single entry
      declined:  "✗",
      offline:   "⚫",
    };
    return icons[status?.toLowerCase?.()] || "•";
  };

  const getStatusLabel = (status) => {
    const labels = {
      available: "Available",
      active:    "Available",
      notified:  "Notified",
      accepted:  "Accepted",
      en_route:  "En Route",           // FIX D: single entry
      declined:  "Declined",
      offline:   "Offline",
    };
    return labels[status?.toLowerCase?.()] || status;
  };

  const availableVolunteers = volunteers.filter((v) =>
    ["available", "active", "notified"].includes(v.status?.toLowerCase?.())
  );

  const activeVolunteers = volunteers.filter((v) =>
    ["accepted", "en_route"].includes(v.status?.toLowerCase?.())
  );

  const handleVolunteerClick = (volunteer) => onVolunteerClick?.(volunteer);

  const handlePingVolunteer = async (e, volunteerId) => {
    e.stopPropagation();
    setPingingId(volunteerId);
    try {
      await onPingVolunteer?.(volunteerId);
    } catch (error) {
      console.error("Failed to ping volunteer:", error);
    } finally {
      setTimeout(() => setPingingId(null), 1000);
    }
  };

  return (
    <div className="volunteer-panel">
      <div className="volunteer-panel-header">
        <h2>👥 Volunteers</h2>
        <div className="volunteer-stats">
          <span className="stat-pill">
            <span className="stat-pill-value">{availableVolunteers.length}</span>
            <span className="stat-pill-label">Available</span>
          </span>
          <span className="stat-pill">
            <span className="stat-pill-value">{activeVolunteers.length}</span>
            <span className="stat-pill-label">Active</span>
          </span>
        </div>
      </div>

      <div className="volunteer-list">
        {volunteers.length === 0 ? (
          <div className="no-volunteers">
            <p>No volunteers registered</p>
            <small>Waiting for volunteers to join...</small>
          </div>
        ) : (
          volunteers.map((v) => (
            <div
              key={v.id}
              className="volunteer-item"
              onClick={() => handleVolunteerClick(v)}
            >
              <div className="volunteer-avatar">
                {v.name?.charAt(0).toUpperCase() ?? "?"}
              </div>
              <div className="volunteer-info">
                <div className="volunteer-name">{v.name}</div>
                <div className="volunteer-status-row">
                  <span className={`status-badge ${getStatusBadgeClass(v.status)}`}>
                    {getStatusIcon(v.status)} {getStatusLabel(v.status)}
                  </span>
                  {v.distance_m && v.status !== "offline" && (
                    <span className="distance-badge">
                      📍 {v.distance_m}m • {v.eta_minutes ?? "?"} min
                    </span>
                  )}
                </div>
              </div>
              {["available", "active", "notified"].includes(v.status?.toLowerCase?.()) && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => handlePingVolunteer(e, v.id)}
                  disabled={pingingId === v.id}
                  title="Ping volunteer"
                  style={{ minWidth: "36px", padding: "8px" }}
                >
                  {pingingId === v.id ? <span className="animate-spin">📡</span> : "📡"}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="quick-actions">
        <button
          className="btn btn-secondary btn-full"
          onClick={() => onVolunteerClick?.({ type: "broadcast" })}
        >
          📢 Broadcast Announcement
        </button>
        <button className="btn btn-outline btn-full" onClick={() => onViewAllVolunteers?.()}>
          📊 View All Volunteers ({volunteers.length})
        </button>
      </div>
    </div>
  );
}