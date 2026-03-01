/**
 * mock/data.js — Section 4.6
 * Mock incident and volunteer data for offline / demo usage.
 */

export const mockIncidents = [
  {
    id: "inc-001",
    type: "Fire",
    location: "Orchard Road, Singapore",
    lat: 1.3048,
    lng: 103.8318,
    severity: "HIGH",
    status: "active",
    timestamp: new Date().toISOString(),
    assignedVolunteerId: "vol-001",
  },
  {
    id: "inc-002",
    type: "Medical Emergency",
    location: "Raffles Place MRT, Singapore",
    lat: 1.2839,
    lng: 103.8517,
    severity: "CRITICAL",
    status: "dispatched",
    timestamp: new Date(Date.now() - 60000).toISOString(),
    assignedVolunteerId: null,
  },
  {
    id: "inc-003",
    type: "Suspicious Sound",
    location: "Bugis Junction, Singapore",
    lat: 1.2993,
    lng: 103.8554,
    severity: "LOW",
    status: "pending",
    timestamp: new Date(Date.now() - 120000).toISOString(),
    assignedVolunteerId: null,
  },
];

export const mockVolunteers = [
  { id: "vol-001", name: "Alice Tan", status: "dispatched", distance: 0.4 },
  { id: "vol-002", name: "Bob Lim", status: "available", distance: 1.2 },
  { id: "vol-003", name: "Chloe Ng", status: "offline", distance: null },
];
