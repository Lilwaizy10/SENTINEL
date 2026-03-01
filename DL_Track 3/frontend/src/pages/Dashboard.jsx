import React from "react";
import AlertFeed from "../components/AlertFeed";
import Map from "../components/Map";
import VolunteerPanel from "../components/VolunteerPanel";
import useWebSocket from "../hooks/useWebSocket";
import { mockIncidents, mockVolunteers } from "../mock/data";

/**
 * Dashboard — Section 4.1 (Route: /)
 * Main operator view with live map, alert feed, and volunteer panel.
 */
export default function Dashboard() {
  const { incidents } = useWebSocket("ws://localhost:8000/ws");
  const liveIncidents = incidents.length ? incidents : mockIncidents;

  return (
    <div className="dashboard">
      <header>
        <h1>SENTINEL — Command Dashboard</h1>
      </header>
      <main className="dashboard-grid">
        <section className="map-section">
          <Map incidents={liveIncidents} />
        </section>
        <aside className="sidebar">
          <AlertFeed incidents={liveIncidents} />
          <VolunteerPanel volunteers={mockVolunteers} />
        </aside>
      </main>
    </div>
  );
}
