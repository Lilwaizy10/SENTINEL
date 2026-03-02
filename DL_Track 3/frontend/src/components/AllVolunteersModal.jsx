import React, { useState } from "react";

/**
 * AllVolunteersModal — Full Volunteer List View
 * Displays all volunteers in a searchable, filterable list.
 */

export default function AllVolunteersModal({ volunteers = [], onClose, onPingVolunteer }) {
  const [filter, setFilter] = useState("all"); // all | available | active | offline
  const [searchTerm, setSearchTerm] = useState("");
  const [pingingId, setPingingId] = useState(null);

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

  const filteredVolunteers = volunteers.filter((v) => {
    // Filter by status
    if (filter === "available") {
      if (v.status !== "available" && v.status !== "notified") return false;
    } else if (filter === "active") {
      if (v.status !== "accepted" && v.status !== "en_route" && v.status !== "en_route") return false;
    } else if (filter === "offline") {
      if (v.status !== "offline") return false;
    }

    // Filter by search term
    if (searchTerm && !v.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    return true;
  });

  const handlePing = async (e, volunteerId) => {
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

  const stats = {
    total: volunteers.length,
    available: volunteers.filter(v => v.status === "available" || v.status === "notified").length,
    active: volunteers.filter(v => v.status === "accepted" || v.status === "en_route").length,
    offline: volunteers.filter(v => v.status === "offline").length,
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "600px", maxHeight: "85vh" }}
      >
        <div className="modal-header">
          <h3>📊 All Volunteers</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Stats */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
            marginBottom: "20px"
          }}>
            <div style={{
              background: "#f8fafc",
              borderRadius: "12px",
              padding: "12px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0ea5e9" }}>
                {stats.total}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                Total
              </div>
            </div>
            <div style={{
              background: "#ecfdf5",
              borderRadius: "12px",
              padding: "12px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#059669" }}>
                {stats.available}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "#059669", textTransform: "uppercase", fontWeight: 600 }}>
                Available
              </div>
            </div>
            <div style={{
              background: "#e0f2fe",
              borderRadius: "12px",
              padding: "12px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0284c7" }}>
                {stats.active}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "#0284c7", textTransform: "uppercase", fontWeight: 600 }}>
                Active
              </div>
            </div>
            <div style={{
              background: "#f1f5f9",
              borderRadius: "12px",
              padding: "12px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#64748b" }}>
                {stats.offline}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                Offline
              </div>
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: "16px" }}>
            <input
              type="text"
              className="input"
              placeholder="🔍 Search volunteers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: "12px 16px" }}
            />
          </div>

          {/* Filter Tabs */}
          <div className="filter-tabs" style={{ marginBottom: "16px" }}>
            <button
              className={`filter-tab ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All ({volunteers.length})
            </button>
            <button
              className={`filter-tab ${filter === "available" ? "active" : ""}`}
              onClick={() => setFilter("available")}
            >
              Available
            </button>
            <button
              className={`filter-tab ${filter === "active" ? "active" : ""}`}
              onClick={() => setFilter("active")}
            >
              Active
            </button>
            <button
              className={`filter-tab ${filter === "offline" ? "active" : ""}`}
              onClick={() => setFilter("offline")}
            >
              Offline
            </button>
          </div>

          {/* Volunteer List */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            maxHeight: "350px",
            overflowY: "auto"
          }}>
            {filteredVolunteers.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "#94a3b8"
              }}>
                <p style={{ fontSize: "0.875rem" }}>No volunteers found</p>
                <small style={{ fontSize: "0.75rem" }}>Try adjusting your filters</small>
              </div>
            ) : (
              filteredVolunteers.map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "14px",
                    background: "#ffffff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    transition: "all 0.2s ease",
                    cursor: "pointer"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateX(4px)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateX(0)";
                    e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                  }}
                >
                  <div style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #0ea5e9 0%, #8b5cf6 100%)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    color: "white",
                    fontSize: "1.125rem",
                    flexShrink: 0
                  }}>
                    {v.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: "0.9375rem",
                      color: "#1e293b",
                      marginBottom: "4px"
                    }}>
                      {v.name}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        width: "fit-content",
                        ...getStatusBadgeStyle(v.status)
                      }}>
                        {getStatusIcon(v.status)} {getStatusLabel(v.status)}
                      </span>
                      {v.distance_m && v.status !== "offline" && (
                        <span style={{
                          fontSize: "0.75rem",
                          color: "#94a3b8"
                        }}>
                          📍 {v.distance_m}m • {v.eta_minutes || "?"} min
                        </span>
                      )}
                    </div>
                  </div>
                  {(v.status === "available" || v.status === "notified") && (
                    <button
                      onClick={(e) => handlePing(e, v.id)}
                      disabled={pingingId === v.id}
                      style={{
                        minWidth: "40px",
                        height: "40px",
                        padding: "8px",
                        borderRadius: "10px",
                        border: "none",
                        background: pingingId === v.id ? "#cbd5e1" : "#0ea5e9",
                        color: "white",
                        cursor: pingingId === v.id ? "not-allowed" : "pointer",
                        display: "grid",
                        placeItems: "center",
                        transition: "all 0.2s ease"
                      }}
                      title="Ping volunteer"
                    >
                      {pingingId === v.id ? (
                        <span className="animate-spin" style={{ display: "inline-block" }}>📡</span>
                      ) : (
                        "📡"
                      )}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function getStatusBadgeStyle(status) {
  const styles = {
    available: { background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" },
    notified: { background: "#eff6ff", color: "#0ea5e9", border: "1px solid #bae6fd" },
    accepted: { background: "#f0fdf4", color: "#10b981", border: "1px solid #86efac" },
    en_route: { background: "#e0f2fe", color: "#0284c7", border: "1px solid #7dd3fc" },
    en_route: { background: "#e0f2fe", color: "#0284c7", border: "1px solid #7dd3fc" },
    declined: { background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" },
    offline: { background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1" },
  };
  return styles[status?.toLowerCase()] || styles.offline;
}
