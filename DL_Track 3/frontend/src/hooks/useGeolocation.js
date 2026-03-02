import { useEffect, useRef, useState } from "react";

/**
 * Fast, robust geolocation:
 * - Races a one-shot getCurrentPosition (fast first fix) vs watchPosition (continuous updates).
 * - Times out gracefully and returns cached positions when available.
 */
export default function useGeolocation(options = {}) {
  const [position, setPosition] = useState(null); // { lat, lng, accuracy, timestamp }
  const [error, setError] = useState(null);
  const [permission, setPermission] = useState("prompt"); // 'granted' | 'denied' | 'prompt'
  const watchIdRef = useRef(null);
  const settledFirstFixRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkPermission() {
      try {
        if (navigator.permissions?.query) {
          const status = await navigator.permissions.query({ name: "geolocation" });
          if (!cancelled) setPermission(status.state);
          status.onchange = () => !cancelled && setPermission(status.state);
        }
      } catch {
        /* Not critical */
      }
    }

    checkPermission();

    if (!("geolocation" in navigator)) {
      setError(new Error("Geolocation is not supported by this browser."));
      return () => {};
    }

    const opts = {
      enableHighAccuracy: true,
      maximumAge: 30_000,  // reuse cached position up to 30s
      timeout: 8_000,      // first-fix timeout
      ...options,
    };

    // --- One-shot first fix (fast as possible) ---
    const firstFixTimer = setTimeout(() => {
      // If getCurrentPosition stalls, we don't block forever.
      if (!settledFirstFixRef.current) {
        // no-op here; watch will likely supply soon
      }
    }, opts.timeout || 8000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        clearTimeout(firstFixTimer);
        settledFirstFixRef.current = true;
        const { latitude, longitude, accuracy } = pos.coords || {};
        setPosition({
          lat: latitude,
          lng: longitude,
          accuracy,
          timestamp: pos.timestamp,
        });
        setError(null);
      },
      (err) => {
        if (cancelled) return;
        clearTimeout(firstFixTimer);
        // Don't fail the hook; watchPosition may still succeed.
        setError(err);
      },
      { ...opts, timeout: opts.timeout || 8000 }
    );

    // --- Continuous updates (more accurate once GNSS locks) ---
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        const { latitude, longitude, accuracy } = pos.coords || {};
        setPosition({
          lat: latitude,
          lng: longitude,
          accuracy,
          timestamp: pos.timestamp,
        });
        setError(null);
      },
      (err) => {
        if (cancelled) return;
        // keep last known position; just record error
        setError(err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      }
    );

    return () => {
      cancelled = true;
      if (watchIdRef.current != null && navigator.geolocation.clearWatch) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      clearTimeout(firstFixTimer);
    };
  }, [options]);

  return { position, error, permission };
}