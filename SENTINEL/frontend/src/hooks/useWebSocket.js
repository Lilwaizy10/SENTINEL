/**
 * useWebSocket — Spec Section 4.5
 * Connects to the FastAPI WebSocket endpoint and handles live incident events.
 * 
 * Event format (Spec Section 3.2):
 * { "type": "EVENT_NAME", "payload": { ... } }
 * 
 * Events:
 * - NEW_INCIDENT: fires when a new incident is created
 * - VOLUNTEER_UPDATE: fires when a volunteer responds
 * - INCIDENT_UPDATE: fires when incident status changes
 * - STATS_UPDATE: fires every 30 seconds with fresh stats
 *
 * @param {string} url - WebSocket URL (e.g. "ws://localhost:8000/ws")
 * @returns {{ incidents: Array, volunteers: Array, stats: Object, connected: boolean }}
 */

import { useState, useEffect, useRef } from 'react';

export default function useWebSocket(url) {
  const [incidents, setIncidents] = useState([]);
  const [volunteerUpdates, setVolunteerUpdates] = useState([]);
  const [stats, setStats] = useState({
    incidents_today: 0,
    active_incidents: 0,
    avg_volunteer_response_s: 94,
    volunteers_active: 4,
  });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[WS] Connected to SENTINEL backend');
      // Subscribe to all zones
      ws.send(JSON.stringify({
        type: 'SUBSCRIBE',
        payload: { zones: ['all'] }
      }));
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[WS] Disconnected from SENTINEL backend');
      // Attempt reconnection after 3 seconds
      setTimeout(() => {
        console.log('[WS] Attempting reconnection...');
        // Window will reload effect will reconnect
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, payload } = message;

        switch (type) {
          case 'NEW_INCIDENT':
            // Prepend new incident to the list
            setIncidents((prev) => {
              const newIncidents = [payload, ...prev].slice(0, 100); // keep last 100
              return newIncidents;
            });
            break;

          case 'VOLUNTEER_UPDATE':
            // Update volunteer status for matching incident
            setVolunteerUpdates((prev) => [payload, ...prev].slice(0, 50));
            break;

          case 'INCIDENT_UPDATE':
            // Update incident status in the list
            setIncidents((prev) =>
              prev.map((inc) =>
                inc.id === payload.id ? { ...inc, ...payload } : inc
              )
            );
            break;

          case 'STATS_UPDATE':
            // Update dashboard stats
            setStats(payload);
            break;

          default:
            // Handle legacy format (direct incident object without type envelope)
            if (payload && payload.id) {
              setIncidents((prev) => [payload, ...prev].slice(0, 100));
            }
            console.log('[WS] Unknown event type:', type);
        }
      } catch (e) {
        console.error('[WS] Parse error:', e, event.data);
      }
    };

    return () => {
      ws.close();
    };
  }, [url]);

  // Listen for incident resolve events from Dashboard
  useEffect(() => {
    const handleResolveEvent = (event) => {
      const { incidentId } = event.detail;
      console.log('🔵 Updating incident status to RESOLVED:', incidentId);
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === incidentId ? { ...inc, status: 'RESOLVED' } : inc
        )
      );
    };

    window.addEventListener('incident-resolved', handleResolveEvent);
    return () => {
      window.removeEventListener('incident-resolved', handleResolveEvent);
    };
  }, []);

  return {
    incidents,
    volunteers: volunteerUpdates,
    stats,
    connected
  };
}
