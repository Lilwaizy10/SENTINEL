import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { mockIncidents, mockVolunteers } from "../mock/data";

/**
 * VolunteerView — Spec Section 4.1
 * Personal view for a volunteer showing their assigned incident.
 * Mobile-first design with accept/decline actions.
 */

export default function VolunteerView() {
  const { id } = useParams();
  const [response, setResponse] = useState(null); // 'accepted' | 'declined'
  
  const volunteer = mockVolunteers.find((v) => v.id === id);
  const assignedIncident = mockIncidents.find((i) => i.assignedVolunteerId === id);

  if (!volunteer) {
    return (
      <div className="volunteer-view not-found">
        <h1>Volunteer not found</h1>
        <p>The volunteer ID "{id}" does not exist.</p>
      </div>
    );
  }

  const handleAccept = async () => {
    setResponse('accepted');
    // In production: POST to /volunteers/{id}/respond
    console.log(`Volunteer ${volunteer.name} accepted incident ${assignedIncident?.id}`);
  };

  const handleDecline = async () => {
    setResponse('declined');
    // In production: POST to /volunteers/{id}/respond
    console.log(`Volunteer ${volunteer.name} declined incident ${assignedIncident?.id}`);
  };

  return (
    <div className="volunteer-view">
      <div className="volunteer-header">
        <div className="volunteer-greeting">
          <span className="wave-icon">👋</span>
          <div>
            <h1>Hello, {volunteer.name.split(' ')[0]}!</h1>
            <p className="volunteer-status-display">
              Status: <span className={`status-badge status-${volunteer.status}`}>{volunteer.status}</span>
            </p>
          </div>
        </div>
      </div>

      {assignedIncident ? (
        <div className="volunteer-alert-card">
          <div className="alert-type">
            <span className="alert-icon">
              {assignedIncident.severity === 'CRITICAL' ? '💀' : 
               assignedIncident.severity === 'HIGH' ? '⚠️' : 
               assignedIncident.severity === 'MEDIUM' ? '⚡' : 'ℹ️'}
            </span>
            <div>
              <div className="alert-title">{formatSoundType(assignedIncident.sound_type || assignedIncident.type)}</div>
              <div className="alert-severity" style={{ color: getSeverityColor(assignedIncident.severity) }}>
                {assignedIncident.severity} SEVERITY
              </div>
            </div>
          </div>

          <div className="alert-location">
            <span>📍</span>
            <span>{assignedIncident.location?.description || assignedIncident.location}</span>
          </div>

          <div className="alert-details">
            <div className="detail-row">
              <span className="detail-label">Recommended Response:</span>
              <span className="detail-value">
                {assignedIncident.recommended_response?.join(', ') || 'SGSecure'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Confidence:</span>
              <span className="detail-value">{Math.round(assignedIncident.confidence * 100)}%</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Time:</span>
              <span className="detail-value">
                {new Date(assignedIncident.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>

          <div className="alert-instructions">
            <h4>📋 Response Guidelines</h4>
            <ul>
              <li>Proceed to the location safely</li>
              <li>Assess the situation upon arrival</li>
              <li>Provide assistance within your training</li>
              <li>Call 995 if professional help is needed</li>
              <li>Update your status when done</li>
            </ul>
          </div>

          {!response ? (
            <div className="response-actions">
              <button className="btn btn-accept" onClick={handleAccept}>
                ✓ ACCEPT ASSIGNMENT
              </button>
              <button className="btn btn-decline" onClick={handleDecline}>
                ✗ DECLINE
              </button>
            </div>
          ) : (
            <div className={`response-confirmation ${response}`}>
              {response === 'accepted' ? (
                <>
                  <div className="confirm-icon">✓</div>
                  <h3>Assignment Accepted!</h3>
                  <p>Please proceed to the location immediately.</p>
                  <p className="eta-info">Estimated arrival: {volunteer.eta_minutes || 2} minutes</p>
                </>
              ) : (
                <>
                  <div className="confirm-icon decline">✗</div>
                  <h3>Assignment Declined</h3>
                  <p>Thank you for your response. Another volunteer will be notified.</p>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="standby-card">
          <div className="standby-icon">🟢</div>
          <h2>No Active Assignment</h2>
          <p>You are currently on standby. You will be notified when an incident occurs in your area.</p>
          <div className="standby-tips">
            <h4>While waiting:</h4>
            <ul>
              <li>Keep your phone volume up</li>
              <li>Stay within your designated zone</li>
              <li>Review response guidelines</li>
              <li>Ensure your location is enabled</li>
            </ul>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="volunteer-quick-actions">
        <button className="btn btn-outline">
          📍 Update Location
        </button>
        <button className="btn btn-outline">
          ⚙️ Settings
        </button>
        <button className="btn btn-outline">
          ❓ Help
        </button>
      </div>
    </div>
  );
}

function formatSoundType(type) {
  if (!type) return "Unknown";
  return type
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getSeverityColor(severity) {
  const colors = {
    CRITICAL: "#FF3B5C",
    HIGH: "#FF8C00",
    MEDIUM: "#FFD600",
    LOW: "#00BB66",
  };
  return colors[severity] || "#64748b";
}
