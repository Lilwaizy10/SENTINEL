import React from 'react';

/**
 * ClassificationBars — Spec Section 10.3
 * Real-time classification confidence bars for top 5 YAMNet results.
 * Updates live as audio is classified.
 */

export default function ClassificationBars({ scores = [] }) {
  // Color mapping for different sound types
  const colors = {
    distress_scream: '#FF3B5C',
    glass_break: '#FF3B5C',
    gunshot: '#FF3B5C',
    explosion: '#FF3B5C',
    screaming: '#FF3B5C',
    shatter: '#FF3B5C',
    impact_thud: '#FF8C00',
    thud: '#FF8C00',
    siren: '#FF8C00',
    alarm: '#FFD600',
    speech: '#00E5FF',
    laughter: '#00E5FF',
    music: '#00E5FF',
    crowd: '#00E5FF',
    default: '#64748b',
  };

  const getColor = (label) => {
    const lowerLabel = label.toLowerCase();
    for (const [key, color] of Object.entries(colors)) {
      if (lowerLabel.includes(key.toLowerCase())) {
        return color;
      }
    }
    return colors.default;
  };

  const isIncidentClass = (label) => {
    const incidentClasses = [
      'distress_scream', 'glass_break', 'gunshot', 'explosion',
      'screaming', 'shatter', 'impact_thud', 'thud', 'siren', 'alarm'
    ];
    const lowerLabel = label.toLowerCase();
    return incidentClasses.some(cls => lowerLabel.includes(cls));
  };

  if (!scores || scores.length === 0) {
    return (
      <div className="classification-bars">
        <div className="bars-header">
          <span>Classification Results</span>
        </div>
        <div className="no-data">
          <p>Waiting for audio input...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="classification-bars">
      <div className="bars-header">
        <span>🎯 Classification Results</span>
        <span className="top-count">Top 5</span>
      </div>
      <div className="bars-container">
        {scores.map((score, index) => {
          const label = score.label || score;
          const confidence = score.confidence || score.score || 0;
          const percentage = (confidence * 100).toFixed(1);
          const color = getColor(label);
          const isWinner = index === 0;
          const isIncident = isIncidentClass(label);

          return (
            <div key={label} className={`result-bar ${isWinner ? 'winner' : ''}`}>
              <div className="result-label">
                <span className={`result-icon ${isIncident ? 'incident' : ''}`}>
                  {isIncident ? '⚠️' : '🔊'}
                </span>
                {label}
              </div>
              <div className="result-progress">
                <div 
                  className={`result-fill ${isWinner ? 'winner-fill' : ''}`}
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: color,
                  }}
                >
                  <span className="result-percentage">{percentage}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
