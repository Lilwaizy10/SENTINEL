// src/components/Map.jsx
import React, { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

/**
 * Map — Enhanced with Light Theme and Vibrant Markers
 * Uses OpenStreetMap light tiles with colorful pulsing markers
 */

// Custom pulsing marker icon with vibrant colors based on severity
const createPulseIcon = (severity) => {
  const colors = {
    CRITICAL: "#dc2626",
    HIGH: "#ea580c",
    MEDIUM: "#eab308",
    LOW: "#059669",
  };
  const color = colors[severity] || colors.LOW;
  const isCritical = severity === "CRITICAL";
  const size = isCritical ? 32 : 24;
  const innerSize = isCritical ? 18 : 14;
  const margin = isCritical ? 7 : 5;

  return L.divIcon({
    className: "",
    html: `
      <div style='position:relative; width:${size}px; height:${size}px;'>
        <div class='pulse-ring' style='
          position:absolute; border-radius:50%;
          border: 3px solid ${color};
          animation: ${isCritical ? 'pulseBorder 2s infinite' : 'pulse-out 1.5s ease-out infinite'};
          width:${size}px; height:${size}px; top:0; left:0;'/>
        <div style='
          width:${innerSize}px; height:${innerSize}px; border-radius:50%;
          background: ${color}; margin:${margin}px;
          box-shadow: ${isCritical ? '0 0 20px 4px rgba(220, 38, 38, 0.5)' : '0 2px 8px rgba(0,0,0,0.3)'};
          ${isCritical ? 'animation: pulse 1s ease-in-out infinite;' : ''}'/>
      </div>`,
    iconSize: [size, size],
  });
};

// Sensor marker (blue dot with white border)
const sensorIcon = L.divIcon({
  className: "",
  html: `<div style='width:12px; height:12px; background:#0ea5e9; border-radius:50%; border:2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.2);'/>`,
  iconSize: [12, 12],
});

// Volunteer marker (green person icon)
const volunteerIcon = L.divIcon({
  className: "",
  html: `<div style='width:24px; height:24px; background:#10b981; border-radius:50%; border:2px solid white; display:grid; place-items:center; color:white; font-size:14px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);'>👤</div>`,
  iconSize: [24, 24],
});

// "You are here" marker (cyan with white border and shadow)
const meIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:20px; height:20px; border-radius:50%;
    background:#06b6d4; border:3px solid white;
    box-shadow:0 0 0 3px rgba(6,182,212,0.3), 0 2px 8px rgba(0,0,0,0.2);
  "></div>`,
  iconSize: [20, 20],
});

// Helper component to open popup for focused incident
function OpenIncidentPopup({ focusIncident, incidents }) {
  const map = useMap();
  
  useEffect(() => {
    if (!focusIncident || !map) return;
    
    // Find the incident in the incidents array
    const incident = incidents.find(inc => 
      inc.id === focusIncident.id || 
      (focusIncident.id && inc.id === focusIncident.id)
    );
    
    if (!incident) return;
    
    // Get coordinates
    const lat = incident.location?.lat || incident.lat;
    const lng = incident.location?.lng || incident.lng;
    
    if (!lat || !lng) return;
    
    // Small delay to ensure map is ready
    setTimeout(() => {
      const severityColor = getSeverityColor(incident.severity);
      const severityIcon = getSeverityIcon(incident.severity);
      
      // Open popup at the incident location
      const popupContent = `
        <div style="min-width: 200px; padding: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 20px;">${severityIcon}</span>
            <strong style="color: ${severityColor}; font-size: 14px;">
              ${incident.sound_type || incident.type}
            </strong>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #64748b; font-size: 12px;">Severity:</span>
            <span style="color: ${severityColor}; font-weight: 600; margin-left: 4px; font-size: 12px;">
              ${incident.severity}
            </span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #64748b; font-size: 12px;">Confidence:</span>
            <span style="color: #1e293b; margin-left: 4px; font-size: 12px;">
              ${Math.round((incident.confidence || 0) * 100)}%
            </span>
          </div>
          ${incident.location?.description ? `
            <div style="margin-bottom: 4px;">
              <span style="color: #64748b; font-size: 12px;">📍</span>
              <span style="color: #1e293b; margin-left: 4px; font-size: 12px;">
                ${incident.location.description}
              </span>
            </div>
          ` : ''}
          <div style="margin-top: 8px; font-size: 11px; color: #94a3b8;">
            👥 ${incident.volunteers_notified || 0} notified
          </div>
        </div>
      `;
      
      L.popup({ 
        closeButton: true,
        autoClose: false,
        className: 'incident-popup'
      })
        .setLatLng([lat, lng])
        .setContent(popupContent)
        .openOn(map);
        
    }, 300);
  }, [focusIncident, incidents, map]);
  
  return null;
}

// Helper component: fly to user location once
function FlyToOnFirstFix({ myLocation, zoom = 16 }) {
  const map = useMap();
  const hasFlownRef = useRef(false);

  useEffect(() => {
    if (!myLocation || hasFlownRef.current) return;
    const { lat, lng } = myLocation || {};
    if (typeof lat === "number" && typeof lng === "number") {
      hasFlownRef.current = true;
      map.flyTo([lat, lng], zoom, { duration: 0.8 });
    }
  }, [myLocation, map, zoom]);

  return null;
}

// Helper component to fly to incident
function FlyToIncident({ focusIncident, zoom = 16 }) {
  const map = useMap();
  const hasFlownRef = useRef(false);

  useEffect(() => {
    console.log('🗺️ FlyToIncident called with:', focusIncident);
    
    if (!focusIncident || hasFlownRef.current) return;

    const lat = focusIncident.location?.lat || focusIncident.lat;
    const lng = focusIncident.location?.lng || focusIncident.lng;
    
    console.log('🗺️ Extracted coordinates:', lat, lng);

    if (typeof lat === "number" && typeof lng === "number") {
      hasFlownRef.current = true;
      console.log('🗺️ Flying to:', [lat, lng], 'zoom:', zoom);
      map.flyTo([lat, lng], zoom, { duration: 0.8 });
    } else {
      console.warn('🗺️ Invalid coordinates:', { lat, lng });
    }
  }, [focusIncident, map, zoom]);

  return null;
}

export default function Map({
  incidents = [],
  volunteers = [],
  sensors = [],
  center = [1.3521, 103.8198],
  myLocation = null,
  focusIncident = null,
}) {
  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: "100%", width: "100%", borderRadius: "12px" }}
      zoomControl={true}
      scrollWheelZoom={true}
      doubleClickZoom={true}
      dragging={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {/* Fly to incident first */}
      <FlyToIncident focusIncident={focusIncident} zoom={16} />
      
      {/* Open popup for focused incident */}
      <OpenIncidentPopup focusIncident={focusIncident} incidents={incidents} />

      {/* Center on user location only if no incident */}
      <FlyToOnFirstFix myLocation={!focusIncident ? myLocation : null} zoom={15} />

      {/* My current location */}
      {myLocation &&
        typeof myLocation.lat === "number" &&
        typeof myLocation.lng === "number" && (
          <>
            <Marker
              position={[myLocation.lat, myLocation.lng]}
              icon={meIcon}
              zIndexOffset={500}
            >
              <Popup>
                <div style={{ minWidth: "200px" }}>
                  <h4 style={{
                    margin: "0 0 8px 0",
                    color: "#06b6d4",
                    fontSize: "1rem",
                    fontWeight: 700
                  }}>
                    📍 You are here
                  </h4>
                  <p style={{ margin: "4px 0", fontSize: "0.875rem", color: "#64748b" }}>
                    Lat: {myLocation.lat.toFixed(6)}, Lng: {myLocation.lng.toFixed(6)}
                  </p>
                  {typeof myLocation.accuracy === "number" && (
                    <p style={{ margin: "4px 0", fontSize: "0.75rem", color: "#94a3b8" }}>
                      Accuracy: ±{Math.round(myLocation.accuracy)} m
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
            {typeof myLocation.accuracy === "number" && myLocation.accuracy > 0 && (
              <Circle
                center={[myLocation.lat, myLocation.lng]}
                radius={Math.min(myLocation.accuracy, 150)}
                pathOptions={{
                  color: "#06b6d4",
                  fillColor: "#06b6d4",
                  fillOpacity: 0.15,
                  weight: 2,
                }}
              />
            )}
          </>
        )}

      {/* Sensor locations */}
      {sensors.map((sensor) => (
        <Marker key={`sensor-${sensor.id}`} position={[sensor.lat, sensor.lng]} icon={sensorIcon}>
          <Popup>
            <div style={{ minWidth: "180px" }}>
              <h4 style={{
                margin: "0 0 8px 0",
                color: "#0ea5e9",
                fontSize: "0.9375rem",
                fontWeight: 700
              }}>
                📡 Sensor: {sensor.id}
              </h4>
              <p style={{ margin: "4px 0", fontSize: "0.875rem", color: "#64748b" }}>
                Zone: {sensor.zone}
              </p>
              <p style={{ margin: "4px 0", fontSize: "0.875rem", color: "#64748b" }}>
                Status: <span style={{ color: sensor.status === "online" ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                  {sensor.status}
                </span>
              </p>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Active incidents with pulsing markers */}
      {incidents
        .filter((inc) => {
          if (!inc || typeof inc !== 'object') return false;
          if (inc.status === "RESOLVED") return false;
          const hasLocation = inc.location?.lat || inc.lat;
          return hasLocation;
        })
        .map((incident) => {
          const pos = incident.location?.lat
            ? [incident.location.lat, incident.location.lng]
            : [incident.lat, incident.lng];

          if (!pos || !pos[0] || !pos[1]) {
            console.warn('Skipping incident with invalid position:', incident.id);
            return null;
          }

          return (
            <React.Fragment key={incident.id}>
              <Marker position={pos} icon={createPulseIcon(incident.severity || 'LOW')} />

              {/* 200m volunteer search radius circle */}
              <Circle
                center={pos}
                radius={200}
                pathOptions={{
                  color: getSeverityColor(incident.severity),
                  fillColor: getSeverityColor(incident.severity),
                  fillOpacity: 0.08,
                  weight: 2,
                  dashArray: "6, 12",
                }}
              />
            </React.Fragment>
          );
        })}

      {/* Volunteer positions */}
      {volunteers
        .filter((v) => v.status === "available" || v.status === "notified" || v.status === "en_route" || v.status === "accepted")
        .map((volunteer) => (
          <Marker
            key={`vol-${volunteer.id}`}
            position={[volunteer.lat, volunteer.lng]}
            icon={volunteerIcon}
          >
            <Popup>
              <div style={{ minWidth: "180px" }}>
                <h4 style={{
                  margin: "0 0 8px 0",
                  color: "#10b981",
                  fontSize: "1rem",
                  fontWeight: 700
                }}>
                  👤 {volunteer.name}
                </h4>
                <p style={{ margin: "4px 0", fontSize: "0.875rem", color: "#64748b" }}>
                  Status: <span style={{
                    color: getStatusColor(volunteer.status),
                    fontWeight: 600,
                    textTransform: "uppercase"
                  }}>
                    {volunteer.status.replace("_", " ")}
                  </span>
                </p>
                {volunteer.distance_m && (
                  <p style={{ margin: "4px 0", fontSize: "0.875rem", color: "#64748b" }}>
                    📍 {volunteer.distance_m}m away
                  </p>
                )}
                {volunteer.eta_minutes && (
                  <p style={{ margin: "4px 0", fontSize: "0.875rem", color: "#64748b" }}>
                    ⏱️ ETA: {volunteer.eta_minutes} min
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}

function getSeverityColor(severity) {
  const colors = {
    CRITICAL: "#dc2626",
    HIGH: "#ea580c",
    MEDIUM: "#eab308",
    LOW: "#059669",
  };
  return colors[severity] || "#64748b";
}

function getSeverityIcon(severity) {
  const icons = {
    CRITICAL: "💀",
    HIGH: "⚠️",
    MEDIUM: "⚡",
    LOW: "ℹ️",
  };
  return icons[severity] || "•";
}

function getStatusColor(status) {
  const colors = {
    available: "#059669",
    notified: "#0ea5e9",
    accepted: "#10b981",
    en_route: "#0284c7",
    declined: "#ef4444",
    offline: "#64748b",
  };
  return colors[status?.toLowerCase()] || "#64748b";
}
