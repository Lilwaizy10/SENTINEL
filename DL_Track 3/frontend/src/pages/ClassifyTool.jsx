import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * ClassifyTool — Spec Section 4.1 & 10.3
 * Upload audio files for YAMNet classification with geolocation.
 * Creates incidents that appear on the dashboard map.
 */

export default function ClassifyTool() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [classification, setClassification] = useState(null);
  const [error, setError] = useState('');
  const [location, setLocation] = useState(null);
  const [incidentCreated, setIncidentCreated] = useState(false);
  const [createdIncidentId, setCreatedIncidentId] = useState(null);

  // Get user location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (err) => {
          console.warn('Location access denied:', err);
          // Default to Singapore coordinates
          setLocation({ lat: 1.3521, lng: 103.8198, accuracy: 100 });
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocation({ lat: 1.3521, lng: 103.8198, accuracy: 100 });
    }
  }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/wav', 'audio/mp3', 'audio/webm', 'audio/mpeg', 'audio/flac', 'audio/x-wav'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.wav')) {
      setError('Invalid file type. Please upload WAV, MP3, WebM, or FLAC');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10MB');
      return;
    }

    setIsUploading(true);
    setError('');
    setClassification(null);
    setIncidentCreated(false);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Add location if available
      if (location) {
        formData.append('lat', location.lat.toString());
        formData.append('lng', location.lng.toString());
        formData.append('location_name', `User Location (±${Math.round(location.accuracy)}m)`);
      }

      console.log('Uploading file for classification...', file.name);
      
      const response = await fetch('http://localhost:8000/classify', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Classification result:', data);

      // Store incident ID if returned from backend
      const incidentId = data.incident_id || data.id;
      if (incidentId) {
        setCreatedIncidentId(incidentId);
      }

      setClassification({
        top_class: data.label || data.top_class,
        confidence: data.confidence,
        top5: data.top5 || [],
        severity: getSeverityFromClass(data.label || data.top_class),
        recommended_response: getRecommendedResponse(data.label || data.top_class)
      });

      setIncidentCreated(true);

    } catch (err) {
      console.error('Classification error:', err);
      setError(`Classification failed: ${err.message}. Make sure backend is running on port 8000.`);
    } finally {
      setIsUploading(false);
    }
  };

  const getSeverityFromClass = (className) => {
    const classLower = className.toLowerCase();
    if (classLower.includes('gunshot') || classLower.includes('explosion')) return 'CRITICAL';
    if (classLower.includes('scream') || classLower.includes('shatter') || classLower.includes('glass')) return 'HIGH';
    if (classLower.includes('thud') || classLower.includes('impact') || classLower.includes('cry')) return 'MEDIUM';
    return 'LOW';
  };

  const getRecommendedResponse = (className) => {
    const severity = getSeverityFromClass(className);
    switch (severity) {
      case 'CRITICAL': return ['Police (999)', 'SCDF (995)', 'SGSecure'];
      case 'HIGH': return ['SCDF (995)', 'SGSecure'];
      case 'MEDIUM': return ['SGSecure'];
      default: return ['Dispatcher Review'];
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      'CRITICAL': '#FF3B5C',
      'HIGH': '#FF8C00',
      'MEDIUM': '#FFD600',
      'LOW': '#00BB66'
    };
    return colors[severity] || '#94a3b8';
  };

  const handleViewOnDashboard = () => {
    // Navigate to dashboard with incident ID to focus on
    navigate('/', {
      state: { focusIncidentId: createdIncidentId }
    });
  };

  return (
    <div className="classify-tool" style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '24px'
    }}>
      <h2 style={{ marginBottom: '8px' }}>🎤 Audio Classification Tool</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Upload an audio file to classify using YAMNet. Incidents are automatically created on the dashboard.
      </p>

      {/* Error Display */}
      {error && (
        <div style={{
          backgroundColor: '#FF3B5C20',
          border: '1px solid #FF3B5C',
          color: '#FF3B5C',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '24px'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Upload Zone */}
      <div 
        className="upload-zone"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add('dragover');
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('dragover');
          const file = e.dataTransfer.files[0];
          if (file) handleFileUpload(file);
        }}
        style={{
          border: '2px dashed var(--border-color)',
          borderRadius: '16px',
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          marginBottom: '32px',
          backgroundColor: 'var(--bg-secondary)'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/wav,audio/mp3,audio/webm,audio/flac"
          onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
          style={{ display: 'none' }}
        />
        
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
        <h3 style={{ marginBottom: '8px' }}>Click to upload or drag and drop</h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          Supports WAV, MP3, WebM, FLAC (max 10MB)
        </p>
        
        {isUploading && (
          <div style={{ marginTop: '24px', color: 'var(--accent)' }}>
            ⏳ Analyzing audio with YAMNet...
          </div>
        )}
      </div>

      {/* Location Info */}
      {location && (
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '24px' }}>📍</span>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Recording Location
            </div>
            <div style={{ fontWeight: '600', fontFamily: 'monospace' }}>
              Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Accuracy: ±{Math.round(location.accuracy)}m
            </div>
          </div>
        </div>
      )}

      {/* Classification Results */}
      {classification && (
        <div className="classification-results">
          {/* Top Classification Card */}
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            padding: '24px',
            borderRadius: '12px',
            border: `2px solid ${getSeverityColor(classification.severity)}`,
            marginBottom: '20px'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <span style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: getSeverityColor(classification.severity),
                color: 'white',
                fontWeight: '700',
                fontSize: '0.875rem'
              }}>
                {classification.severity}
              </span>
            </div>
            
            <div style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '8px' }}>
              {classification.top_class}
            </div>
            
            <div style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Confidence: <strong style={{ color: getSeverityColor(classification.severity) }}>
                {(classification.confidence * 100).toFixed(1)}%
              </strong>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <strong>Recommended Response:</strong>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                {classification.recommended_response.map((response, idx) => (
                  <span key={idx} className="badge" style={{
                    backgroundColor: 'var(--accent)',
                    color: 'white',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    fontSize: '0.75rem'
                  }}>
                    {response}
                  </span>
                ))}
              </div>
            </div>

            {incidentCreated && (
              <div style={{
                padding: '12px',
                backgroundColor: '#00BB6620',
                border: '1px solid #00BB66',
                borderRadius: '8px',
                color: '#00BB66',
                fontWeight: '600'
              }}>
                ✅ Incident created and sent to dashboard!
              </div>
            )}
          </div>

          {/* Top-5 Bar Chart */}
          {classification.top5 && classification.top5.length > 0 && (
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '20px'
            }}>
              <h4 style={{ marginBottom: '16px' }}>Top 5 Classifications</h4>
              {classification.top5.map((result, idx) => (
                <div key={idx} style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.875rem' }}>
                    <span style={{ color: idx === 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {result.label || result}
                    </span>
                    <span style={{ fontWeight: '600' }}>
                      {((result.confidence || result.score || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{
                    height: '24px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: '12px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${(result.confidence || result.score || 0) * 100}%`,
                      backgroundColor: idx === 0 ? getSeverityColor(classification.severity) : 'var(--accent)',
                      borderRadius: '12px',
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* View on Dashboard Button */}
          <button
            onClick={handleViewOnDashboard}
            className="btn btn-primary"
            style={{
              padding: '14px 28px',
              fontSize: '1rem',
              fontWeight: '600',
              width: '100%'
            }}
          >
            🗺️ View on Dashboard Map
          </button>
        </div>
      )}

      {/* Info Section */}
      <div style={{
        marginTop: '32px',
        padding: '20px',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '12px'
      }}>
        <h3 style={{ marginBottom: '12px' }}>How it works</h3>
        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          This tool uses Google's YAMNet audio classification model to identify sounds in your audio file. 
          YAMNet is trained on 521 audio event classes from the AudioSet ontology.
        </p>
        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginTop: '12px' }}>
          For the SENTINEL system, we watch for specific sound classes like screams, glass breaks, 
          gunshots, and impacts that may indicate safety incidents. When detected, an incident is 
          automatically created and appears on the dashboard map at your location.
        </p>
      </div>
    </div>
  );
}
