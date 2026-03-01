import React from "react";
import { useParams } from "react-router-dom";
import { mockIncidents, mockVolunteers } from "../mock/data";

/**
 * VolunteerView — Section 4.1 (Route: /volunteer/:id)
 * Personal view for a volunteer showing their assigned incident.
 */
export default function VolunteerView() {
  const { id } = useParams();
  const volunteer = mockVolunteers.find((v) => v.id === id);
  const assignedIncident = mockIncidents.find((i) => i.assignedVolunteerId === id);

  if (!volunteer) return <p>Volunteer not found.</p>;

  return (
    <div className="volunteer-view">
      <h1>Hello, {volunteer.name}</h1>
      <p>Status: <strong>{volunteer.status}</strong></p>
      {assignedIncident ? (
        <div>
          <h2>Your Assignment</h2>
          <p>Type: {assignedIncident.type}</p>
          <p>Location: {assignedIncident.location}</p>
          <p>Severity: {assignedIncident.severity}</p>
        </div>
      ) : (
        <p>No active assignment. Stand by.</p>
      )}
    </div>
  );
}
