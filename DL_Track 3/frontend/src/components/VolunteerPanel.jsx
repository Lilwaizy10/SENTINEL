import React from "react";

/**
 * VolunteerPanel — Spec Section 4.4
 * Lists volunteers and their assignment status with distance and ETA.
 * Status badges: Notified | Accepted | En Route | Declined | Available
 */

export default function VolunteerPanel({ volunteers = [], incidents = [] }) {
  const getActiveIncidentCount = () => {
    return incidents.filter((i) => i.status !== "RESOLVED").length;
  };

  const getStatusBadgeClass = (status) => {
    const classes = {
      notified: "status-notified",
      accepted: "status-accepted",
      en_route: "status-enroute",
      "en_route": "status-enroute",
      declined: "status-declined",
      available: "status-available",
      offline: "status-offline",
    };
    return classes[status?.toLowerCase?.()] || "status-notified";
  };

  const getStatusIcon = (status) => {
    const icons = {
      notified: "📳",
      accepted: "✓",
      en_route: "🚗",
      "en_route": "🚗",
      declined: "✗",
      available: "🟢",
      offline: "⚫",
    };
    return icons[status?.toLowerCase?.()] || "•";
  };

  const availableVolunteers = volunteers.filter(
    (v) => v.status === "available" || v.status === "notified"
  );
  const activeVolunteers = volunteers.filter(
    (v) => v.status === "accepted" || v.status === "en_route"
  );

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
          </div>
        ) : (
          volunteers.map((v) => (
            <div key={v.id} className="volunteer-item">
              <div className="volunteer-avatar">
                {v.name.charAt(0).toUpperCase()}
              </div>
              <div className="volunteer-info">
                <div className="volunteer-name">{v.name}</div>
                <div className="volunteer-status-row">
                  <span className={`status-badge ${getStatusBadgeClass(v.status)}`}>
                    {getStatusIcon(v.status)} {v.status?.replace("_", " ")}
                  </span>
                  {v.distance_m && v.status !== "offline" && (
                    <span className="distance-badge">
                      📍 {v.distance_m}m • {v.eta_minutes} min
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick actions (Spec Section 4.4) */}
      <div className="quick-actions">
        <button className="btn btn-primary btn-full">
          📢 Broadcast Alert
        </button>
        <button className="btn btn-outline btn-full">
          📊 View All Volunteers
        </button>
      </div>
    </div>
  );
}
