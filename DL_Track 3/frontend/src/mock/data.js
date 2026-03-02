/**
 * mock/data.js — Spec Section 4.6
 * Mock incident and volunteer data for offline / demo usage.
 * Uses proper format matching backend WebSocket events.
 */

export const mockIncidents = [
  {
    id: 'inc_001',
    timestamp: new Date().toISOString(),
    location: {
      lat: 1.3521,
      lng: 103.8198,
      zone: 'Bedok North',
      description: 'Void Deck Block 123',
    },
    sound_type: 'distress_scream',
    confidence: 0.87,
    severity: 'HIGH',
    recommended_response: ['SCDF (995)', 'SGSecure'],
    volunteers_notified: 3,
    status: 'OPEN',
    sensor_id: 'pi-north-01',
  },
  {
    id: 'inc_002',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    location: {
      lat: 1.3644,
      lng: 103.9915,
      zone: 'Tampines',
      description: 'HDB Corridor Block 45',
    },
    sound_type: 'glass_break',
    confidence: 0.79,
    severity: 'HIGH',
    recommended_response: ['SGSecure'],
    volunteers_notified: 2,
    status: 'ACTIVE',
    sensor_id: 'pi-south-02',
  },
  {
    id: 'inc_003',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    location: {
      lat: 1.3343,
      lng: 103.8490,
      zone: 'Toa Payoh',
      description: 'Void Deck Block 56',
    },
    sound_type: 'impact_thud',
    confidence: 0.72,
    severity: 'MEDIUM',
    recommended_response: ['SGSecure'],
    volunteers_notified: 1,
    status: 'DISPATCHED',
    sensor_id: 'pi-east-03',
  },
  {
    id: 'inc_004',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    location: {
      lat: 1.3331,
      lng: 103.7420,
      zone: 'Jurong East',
      description: 'HDB Walkway Block 78',
    },
    sound_type: 'car_alarm',
    confidence: 0.85,
    severity: 'LOW',
    recommended_response: ['Dispatcher Review'],
    volunteers_notified: 0,
    status: 'RESOLVED',
    sensor_id: 'pi-west-04',
  },
];

export const mockVolunteers = [
  { 
    id: 'vol-001', 
    name: 'Alice Tan', 
    status: 'en_route',
    distance_m: 400,
    eta_minutes: 2,
    lat: 1.3048,
    lng: 103.8318,
  },
  { 
    id: 'vol-002', 
    name: 'Bob Lim', 
    status: 'available',
    distance_m: 1200,
    eta_minutes: 5,
    lat: 1.2993,
    lng: 103.8554,
  },
  { 
    id: 'vol-003', 
    name: 'Chloe Ng', 
    status: 'offline',
    distance_m: null,
    eta_minutes: null,
    lat: 1.2839,
    lng: 103.8517,
  },
  { 
    id: 'vol-004', 
    name: 'Ravi S.', 
    status: 'accepted',
    distance_m: 180,
    eta_minutes: 2,
    lat: 1.3521,
    lng: 103.8198,
  },
  { 
    id: 'vol-005', 
    name: 'Sarah Wong', 
    status: 'notified',
    distance_m: 600,
    eta_minutes: 3,
    lat: 1.3343,
    lng: 103.8490,
  },
];

export const mockStats = {
  incidents_today: 12,
  active_incidents: 3,
  avg_volunteer_response_s: 94,
  volunteers_active: 4,
};

export const mockSensors = [
  { id: 'pi-north-01', zone: 'Bedok North', lat: 1.3245, lng: 103.9301, status: 'online' },
  { id: 'pi-south-02', zone: 'Tampines Central', lat: 1.3530, lng: 103.9440, status: 'online' },
  { id: 'pi-east-03', zone: 'Toa Payoh', lat: 1.3343, lng: 103.8490, status: 'online' },
  { id: 'pi-west-04', zone: 'Jurong East', lat: 1.3331, lng: 103.7420, status: 'online' },
  { id: 'pi-central-05', zone: 'Woodlands', lat: 1.4365, lng: 103.7864, status: 'online' },
];
