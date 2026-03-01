import { useState, useEffect, useRef } from "react";

/**
 * useWebSocket — Section 4.5
 * Connects to the FastAPI WebSocket endpoint and accumulates live incident events.
 *
 * @param {string} url - WebSocket URL (e.g. "ws://localhost:8000/ws")
 * @returns {{ incidents: Array, connected: boolean }}
 */
export default function useWebSocket(url) {
  const [incidents, setIncidents] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setIncidents((prev) => [data, ...prev].slice(0, 100)); // keep last 100
      } catch (e) {
        console.error("WS parse error", e);
      }
    };

    return () => ws.close();
  }, [url]);

  return { incidents, connected };
}
