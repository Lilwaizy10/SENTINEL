import React, { useState, useRef, useEffect } from "react";
import IncidentCard from "./IncidentCard";

/**
 * AlertFeed — Live Incident Alerts with Filtering
 *
 * FIX A: Root element was <div className="sidebar-header"> which is styled
 *   as only the narrow header bar. The .alert-feed child had no height context
 *   so it collapsed to 0px and incidents were invisible even when present.
 *   Root is now a flex-column wrapper that fills the sidebar correctly.
 *
 * FIX B: isNew={index === 0 && filter === "all"} was permanently true for
 *   the first card regardless of whether it just arrived. This meant the
 *   slam-in animation never fired for genuinely new incidents (the card
 *   at index 0 was already animated on mount and React doesn't re-run
 *   CSS animations on re-renders without a key change).
 *   Fix: track the previous incident count via a ref. A card only gets
 *   isNew=true if it arrived after the component was already mounted AND
 *   it sits at index 0 in the sorted list.
 */

export default function AlertFeed({ incidents = [], onSelect, onResolve, onNotes, connected = true, isLive = false }) {
  const [filter, setFilter] = useState("all");

  // Track how many incidents were present on the previous render so we can
  // identify cards that genuinely just arrived.
  const prevCountRef  = useRef(incidents.length);
  const isMountedRef  = useRef(false);
  const [newIncidentId, setNewIncidentId] = useState(null);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      prevCountRef.current = incidents.length;
      return;
    }

    // A new incident arrived — find its id so we can animate exactly that card
    if (incidents.length > prevCountRef.current) {
      // useWebSocket prepends new incidents, so index 0 is always the newest
      const newest = incidents[0];
      if (newest?.id) {
        setNewIncidentId(newest.id);
        // Clear the flag after the animation duration so it doesn't re-trigger
        const t = setTimeout(() => setNewIncidentId(null), 600);
        prevCountRef.current = incidents.length;
        return () => clearTimeout(t);
      }
    }
    prevCountRef.current = incidents.length;
  }, [incidents]);

  // Filter and validate incidents
  const filteredIncidents = incidents.filter((inc) => {
    if (!inc || typeof inc !== "object") return false;
    // Guard against classification results leaking into the incident array
    if (inc.class && !inc.id) return false;
    if (!inc.id) return false;

    const status = inc.status?.toUpperCase?.() || "OPEN";
    if (filter === "active")   return status !== "RESOLVED";
    if (filter === "resolved") return status === "RESOLVED";
    return true;
  });

  // Sort by timestamp, newest first
  
  const sortedIncidents = [...filteredIncidents].sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
  });

  return (
    // FIX A: wrapper fills the sidebar; header + feed stacked as flex column
    <div className="alert-feed-wrapper">
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <h2>🚨 Live Alerts</h2>
          {/* FIX #8: show data source so judges always know what they're seeing */}
          {!connected ? (
            <span className="feed-status feed-status-connecting">⟳ Connecting…</span>
          ) : !isLive ? (
            <span className="feed-status feed-status-mock">Demo data</span>
          ) : (
            <span className="feed-status feed-status-live">● Live</span>
          )}
        </div>
        <div className="filter-tabs">
          {["all", "active", "resolved"].map((f) => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "active" && incidents.filter(i => i.status?.toUpperCase() !== "RESOLVED" && i.id).length > 0 && (
                <span className="filter-count">
                  {incidents.filter(i => i.status?.toUpperCase() !== "RESOLVED" && i.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="alert-feed">
        {sortedIncidents.length === 0 ? (
          <div className="no-alerts">
            <p>No alerts to display</p>
            <small>Waiting for incidents...</small>
          </div>
        ) : (
          sortedIncidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              isNew={incident.id === newIncidentId}   // FIX B
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