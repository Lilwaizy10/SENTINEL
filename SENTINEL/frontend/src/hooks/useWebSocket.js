/**
 * useWebSocket — Spec Section 4.5
 *
 * FIX 4: Reconnection was a no-op.
 *   The original setTimeout callback only logged a message — it never
 *   actually created a new WebSocket. If the Colab runtime refreshed its
 *   ngrok URL, or the connection dropped for any reason, the dashboard
 *   went permanently dark with no recovery path.
 *
 *   Fix: move the WebSocket construction into a ref'd `connect()` function
 *   and schedule a real reconnection attempt from onclose, with exponential
 *   backoff (1s → 2s → 4s → … capped at 30s) so a flapping connection
 *   doesn't hammer the server.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS  = 30_000;

export default function useWebSocket(url) {
  const [incidents,        setIncidents]        = useState([]);
  const [volunteerUpdates, setVolunteerUpdates] = useState([]);
  const [stats,            setStats]            = useState({
    incidents_today:          0,
    active_incidents:         0,
    avg_volunteer_response_s: 94,
    volunteers_active:        4,
  });
  const [connected, setConnected] = useState(false);

  const wsRef         = useRef(null);
  const retryDelayRef = useRef(BASE_DELAY_MS);
  const retryTimerRef = useRef(null);
  const unmountedRef  = useRef(false);   // prevent state updates after unmount

  // ── message handler (stable reference — no url dependency) ─────────────
  const handleMessage = useCallback((event) => {
    try {
      const { type, payload } = JSON.parse(event.data);

      switch (type) {
        case 'NEW_INCIDENT':
          setIncidents((prev) => [payload, ...prev].slice(0, 100));
          break;

        case 'VOLUNTEER_UPDATE':
          setVolunteerUpdates((prev) => [payload, ...prev].slice(0, 50));
          break;

        case 'INCIDENT_UPDATE':
          setIncidents((prev) =>
            prev.map((inc) => (inc.id === payload.id ? { ...inc, ...payload } : inc))
          );
          break;

        case 'STATS_UPDATE':
          setStats(payload);
          break;

        default:
          // Legacy: bare incident object without type envelope
          if (payload?.id) {
            setIncidents((prev) => [payload, ...prev].slice(0, 100));
          }
          console.log('[WS] Unknown event type:', type);
      }
    } catch (e) {
      console.error('[WS] Parse error:', e, event.data);
    }
  }, []);

  // ── core connect function ───────────────────────────────────────────────
  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    // Tear down any existing socket before opening a new one
    if (wsRef.current) {
      wsRef.current.onclose = null;   // prevent the old close from scheduling another retry
      wsRef.current.close();
    }

    console.log('[WS] Connecting to', url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      setConnected(true);
      retryDelayRef.current = BASE_DELAY_MS;   // reset backoff on successful connect
      console.log('[WS] Connected to SENTINEL backend');
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', payload: { zones: ['all'] } }));
    };

    ws.onclose = (evt) => {
      if (unmountedRef.current) return;
      setConnected(false);
      console.log(`[WS] Disconnected (code ${evt.code}). Reconnecting in ${retryDelayRef.current}ms…`);

      // FIX 4: schedule a real reconnection attempt
      retryTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, MAX_DELAY_MS);
          connect();
        }
      }, retryDelayRef.current);
    };

    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
      // onclose fires automatically after onerror — reconnect happens there
    };

    ws.onmessage = handleMessage;
  }, [url, handleMessage]);

  // ── lifecycle ───────────────────────────────────────────────────────────
  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;   // don't reconnect on intentional unmount
        wsRef.current.close();
      }
    };
  }, [connect]);   // connect is stable as long as url doesn't change

  // ── incident-resolved custom event (from Dashboard) ────────────────────
  useEffect(() => {
    const handler = ({ detail: { incidentId } }) => {
      setIncidents((prev) =>
        prev.map((inc) => (inc.id === incidentId ? { ...inc, status: 'RESOLVED' } : inc))
      );
    };
    window.addEventListener('incident-resolved', handler);
    return () => window.removeEventListener('incident-resolved', handler);
  }, []);

  return { incidents, volunteers: volunteerUpdates, stats, connected };
}