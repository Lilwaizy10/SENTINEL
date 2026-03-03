import React, { useState } from "react";

/**
 * VolunteerPanel — Interactive Volunteer List
 * Lists volunteers with clickable cards, status badges, and ping functionality.
 */

export default function VolunteerPanel({ 
  volunteers = [], 
  incidents = [], 
  onVolunteerClick, 
  onPingVolunteer,
  onViewAllVolunteers 
}) {
  const [pingingId, setPingingId] = useState(null);

  const getActiveIncidentCount = () => {
    return incidents.filter((i) => i.status !== "RESOLVED").length;
  };

  const getStatusBadgeClass = (status) => {
    const classes = {
      available: "status-available",
      notified: "status-notified",
      accepted: "status-accepted",
      en_route: "status-enroute",
      en_route: "status-enroute",
      declined: "status-declined",
      offline: "status-offline",
    };
    return classes[status?.toLowerCase?.()] || "status-notified";
  };

  const getStatusIcon = (status) => {
    const icons = {
      available: "🟢",
      notified: "📳",
      accepted: "✓",
      en_route: "🚗",
      en_route: "🚗",
      declined: "✗",
      offline: "⚫",
    };
    return icons[status?.toLowerCase?.()] || "•";
  };

  const getStatusLabel = (status) => {
    const labels = {
      available: "Available",
      notified: "Notified",
      accepted: "Accepted",
      en_route: "En Route",
      en_route: "En Route",
      declined: "Declined",
      offline: "Offline",
    };
    return labels[status?.toLowerCase?.()] || status;
  };

  const availableVolunteers = volunteers.filter(
    (v) => v.status === "available" || v.status === "notified"
  );
  const activeVolunteers = volunteers.filter(
    (v) => v.status === "accepted" || v.status === "en_route" || v.status === "en_route"
  );

  const handleVolunteerClick = (volunteer) => {
    onVolunteerClick?.(volunteer);
  };

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

  const handleViewAll = () => {
    onViewAllVolunteers?.();
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
                {v.name.charAt(0).toUpperCase()}
              </div>
              <div className="volunteer-info">
                <div className="volunteer-name">{v.name}</div>
                <div className="volunteer-status-row">
                  <span className={`status-badge ${getStatusBadgeClass(v.status)}`}>
                    {getStatusIcon(v.status)} {getStatusLabel(v.status)}
                  </span>
                  {v.distance_m && v.status !== "offline" && (
                    <span className="distance-badge">
                      📍 {v.distance_m}m • {v.eta_minutes || "?"} min
                    </span>
                  )}
                </div>
              </div>
              {(v.status === "available" || v.status === "notified") && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => handlePingVolunteer(e, v.id)}
                  disabled={pingingId === v.id}
                  title="Ping volunteer"
                  style={{ minWidth: "36px", padding: "8px" }}
                >
                  {pingingId === v.id ? (
                    <span className="animate-spin">📡</span>
                  ) : (
                    "📡"
                  )}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Quick actions */}
      <div className="quick-actions">
        <button
          className="btn btn-secondary btn-full"
          onClick={() => onVolunteerClick?.({ type: "broadcast" })}
        >
          📢 Broadcast Announcement
        </button>
        <button 
          className="btn btn-outline btn-full"
          onClick={handleViewAll}
        >
          📊 View All Volunteers ({volunteers.length})
        </button>
      </div>
    </div>
  );
}
