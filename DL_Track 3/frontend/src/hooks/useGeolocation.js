import { useEffect, useRef, useState } from "react";

/**
 * Fast, robust geolocation:
 * - Races a one-shot getCurrentPosition (fast first fix) vs watchPosition (continuous updates).
 * - Times out gracefully and returns cached positions when available.
 * - Uses maximumAge: 0 to force fresh GPS fixes
 */
export default function useGeolocation(options = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [permission, setPermission] = useState("prompt");
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
      maximumAge: 0,  // FORCE FRESH FIX - don't use cached positions
      timeout: 15_000,
      ...options,
    };

    // --- One-shot first fix ---
    const firstFixTimer = setTimeout(() => {
      if (!settledFirstFixRef.current) {
        console.log('⏱️ First fix timeout - waiting for watchPosition');
      }
    }, opts.timeout || 15000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        clearTimeout(firstFixTimer);
        settledFirstFixRef.current = true;
        const { latitude, longitude, accuracy } = pos.coords || {};
        console.log('✅ GPS Fix acquired - Accuracy:', accuracy.toFixed(1) + 'm', 'Lat:', latitude.toFixed(6), 'Lng:', longitude.toFixed(6));
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
        console.warn('⚠️ Geolocation error:', err.code, err.message);
        setError(err);
      },
      { ...opts, timeout: opts.timeout || 15000 }
    );

    // --- Continuous updates ---
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        const { latitude, longitude, accuracy } = pos.coords || {};
        console.log('📍 Position update - Accuracy:', accuracy.toFixed(1) + 'm', 'Lat:', latitude.toFixed(6), 'Lng:', longitude.toFixed(6));
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
        console.warn('⚠️ Watch error:', err.code, err.message);
        setError(err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,  // FORCE FRESH FIX
        timeout: 30_000,
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