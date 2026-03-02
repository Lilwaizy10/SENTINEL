import React from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

/**
 * Map — Spec Section 4.4 & 10.5
 * Renders incident pins on a Leaflet map with severity-based pulsing markers.
 * Shows 200m volunteer search radius around active incidents.
 */

// Custom pulsing marker icon (Spec Section 10.5)
const createPulseIcon = (severity) => {
  const colors = {
    CRITICAL: '#FF3B5C',
    HIGH: '#FF8C00',
    MEDIUM: '#FFD600',
    LOW: '#00BB66',
  };
  const color = colors[severity] || colors.LOW;

  return L.divIcon({
    className: '',
    html: `
      <div style='position:relative; width:20px; height:20px;'>
        <div class='pulse-ring' style='
          position:absolute; border-radius:50%;
          border: 3px solid ${color};
          animation: pulse-out 1.5s ease-out infinite;
          width:20px; height:20px; top:0; left:0;'/>
        <div style='
          width:12px; height:12px; border-radius:50%;
          background:${color}; margin:4px;'/>
      </div>`,
    iconSize: [20, 20],
  });
};

// Sensor marker (small dot)
const sensorIcon = L.divIcon({
  className: '',
  html: `<div style='width:8px; height:8px; background:#64748b; border-radius:50%;'/>`,
  iconSize: [8, 8],
});

// Volunteer marker (blue person icon)
const volunteerIcon = L.divIcon({
  className: '',
  html: `<div style='width:16px; height:16px; background:#3b82f6; border-radius:50%; border:2px solid white; display:grid; place-items:center; color:white; font-size:10px;'>👤</div>`,
  iconSize: [16, 16],
});

export default function Map({ incidents = [], volunteers = [], sensors = [], center = [1.3521, 103.8198] }) {
  return (
    <MapContainer 
      center={center} 
      zoom={12} 
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      
      {/* Sensor locations (small dots) */}
      {sensors.map((sensor) => (
        <Marker 
          key={`sensor-${sensor.id}`} 
          position={[sensor.lat, sensor.lng]}
          icon={sensorIcon}
        >
          <Popup>
            <strong>Sensor: {sensor.id}</strong>
            <br />
            Zone: {sensor.zone}
            <br />
            Status: {sensor.status}
          </Popup>
        </Marker>
      ))}

      {/* Active incidents with pulsing markers */}
      {incidents
        .filter((inc) => inc.status !== 'RESOLVED')
        .map((incident) => {
          const pos = incident.location?.lat 
            ? [incident.location.lat, incident.location.lng]
            : [incident.lat, incident.lng];
          
          return (
            <React.Fragment key={incident.id}>
              <Marker 
                position={pos}
                icon={createPulseIcon(incident.severity)}
              >
                <Popup>
                  <strong style={{ color: getSeverityColor(incident.severity) }}>
                    {incident.sound_type || incident.type}
                  </strong>
                  <br />
                  Severity: {incident.severity}
                  <br />
                  Confidence: {(incident.confidence * 100).toFixed(0)}%
                  <br />
                  {incident.location?.description && (
                    <>📍 {incident.location.description}</>
                  )}
                  <br />
                  <small>Volunteers notified: {incident.volunteers_notified}</small>
                </Popup>
              </Marker>
              
              {/* 200m volunteer search radius circle */}
              <Circle
                center={pos}
                radius={200}
                pathOptions={{
                  color: getSeverityColor(incident.severity),
                  fillColor: getSeverityColor(incident.severity),
                  fillOpacity: 0.1,
                  weight: 1,
                  dashArray: '5, 10',
                }}
              />
            </React.Fragment>
          );
        })}

      {/* Volunteer positions */}
      {volunteers
        .filter((v) => v.status === 'available' || v.status === 'notified')
        .map((volunteer) => (
          <Marker
            key={`vol-${volunteer.id}`}
            position={[volunteer.lat, volunteer.lng]}
            icon={volunteerIcon}
          >
            <Popup>
              <strong>{volunteer.name}</strong>
              <br />
              Status: {volunteer.status}
              <br />
              {volunteer.distance_m && (
                <>Distance: {volunteer.distance_m}m</>
              )}
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}

function getSeverityColor(severity) {
  const colors = {
    CRITICAL: '#FF3B5C',
    HIGH: '#FF8C00',
    MEDIUM: '#FFD600',
    LOW: '#00BB66',
  };
  return colors[severity] || '#64748b';
}
