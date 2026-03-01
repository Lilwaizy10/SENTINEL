import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Map — Section 4.4
 * Renders incident pins on a Leaflet map.
 */
export default function Map({ incidents = [], center = [1.3521, 103.8198] }) {
  return (
    <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {incidents.map((incident) => (
        <Marker key={incident.id} position={[incident.lat, incident.lng]}>
          <Popup>
            <strong>{incident.type}</strong>
            <br />
            Severity: {incident.severity}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
