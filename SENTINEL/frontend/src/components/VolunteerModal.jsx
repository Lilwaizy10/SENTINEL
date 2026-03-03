import React from "react";

/**
 * VolunteerModal — Volunteer Detail View
 * Displays full volunteer profile with contact info, status, and response history.
 */

export default function VolunteerModal({ volunteer, onClose, onPing }) {
  if (!volunteer || volunteer.type === "broadcast") {
    return null;
  }

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

  const handlePing = () => {
    onPing?.(volunteer.id);
  };

  const formatCoordinate = (coord, isLat = true) => {
    if (!coord) return "N/A";
    return `${Math.abs(coord).toFixed(4)}° ${isLat ? (coord >= 0 ? "N" : "S") : (coord >= 0 ? "E" : "W")}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>👤 Volunteer Details</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="volunteer-detail">
            {/* Header with Avatar */}
            <div className="volunteer-detail-header">
              <div className="volunteer-detail-avatar">
                {volunteer.name.charAt(0).toUpperCase()}
              </div>
              <div className="volunteer-detail-info">
                <h4>{volunteer.name}</h4>
                <span className={`status-badge ${getStatusBadgeClass(volunteer.status)}`}>
                  {getStatusIcon(volunteer.status)} {getStatusLabel(volunteer.status)}
                </span>
              </div>
            </div>

            {/* Status & Location */}
            <div className="volunteer-detail-section">
              <h5>Current Status</h5>
              <div className="volunteer-detail-row">
                <span>Status</span>
                <span style={{
                  color: getStatusColor(volunteer.status),
                  fontWeight: 600,
                  textTransform: "uppercase"
                }}>
                  {getStatusLabel(volunteer.status)}
                </span>
              </div>
              {volunteer.distance_m && (
                <div className="volunteer-detail-row">
                  <span>Distance</span>
                  <span>{volunteer.distance_m}m away</span>
                </div>
              )}
              {volunteer.eta_minutes && (
                <div className="volunteer-detail-row">
                  <span>ETA</span>
                  <span>{volunteer.eta_minutes} minutes</span>
                </div>
              )}
              {volunteer.last_seen && (
                <div className="volunteer-detail-row">
                  <span>Last Seen</span>
                  <span>{formatLastSeen(volunteer.last_seen)}</span>
                </div>
              )}
            </div>

            {/* Location Info */}
            <div className="volunteer-detail-section">
              <h5>Location</h5>
              <div className="volunteer-detail-row">
                <span>Latitude</span>
                <span style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>
                  {formatCoordinate(volunteer.lat, true)}
                </span>
              </div>
              <div className="volunteer-detail-row">
                <span>Longitude</span>
                <span style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>
                  {formatCoordinate(volunteer.lng, false)}
                </span>
              </div>
              {volunteer.zone && (
                <div className="volunteer-detail-row">
                  <span>Zone</span>
                  <span>{volunteer.zone}</span>
                </div>
              )}
            </div>

            {/* Contact Info (placeholder for future implementation) */}
            <div className="volunteer-detail-section">
              <h5>Contact Information</h5>
              <div className="volunteer-detail-row">
                <span>Phone</span>
                <span style={{ color: "#94a3b8" }}>+65 **** ****</span>
              </div>
              <div className="volunteer-detail-row">
                <span>Email</span>
                <span style={{ color: "#94a3b8" }}>****@sentinel.sg</span>
              </div>
              <div className="volunteer-detail-row">
                <span>Volunteer ID</span>
                <span style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>{volunteer.id}</span>
              </div>
            </div>

            {/* Response History (placeholder for future implementation) */}
            <div className="volunteer-detail-section">
              <h5>Response History</h5>
              <div style={{ textAlign: "center", padding: "16px", color: "#94a3b8" }}>
                <p style={{ fontSize: "0.875rem", marginBottom: "4px" }}>
                  📊 Response statistics coming soon
                </p>
                <small style={{ fontSize: "0.75rem" }}>
                  Track volunteer response times and acceptance rates
                </small>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Close
          </button>
          {(volunteer.status === "available" || volunteer.status === "notified") && (
            <button className="btn btn-primary" onClick={handlePing}>
              📡 Ping Volunteer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getStatusColor(status) {
  const colors = {
    available: "#059669",
    notified: "#0ea5e9",
    accepted: "#10b981",
    en_route: "#0284c7",
    en_route: "#0284c7",
    declined: "#ef4444",
    offline: "#64748b",
  };
  return colors[status?.toLowerCase()] || "#64748b";
}

function formatLastSeen(timestamp) {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return date.toLocaleDateString("en-SG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
