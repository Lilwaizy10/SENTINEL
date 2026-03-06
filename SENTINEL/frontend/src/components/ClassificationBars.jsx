import React from 'react';

/**
 * ClassificationBars — Spec Section 10.3
 * Real-time classification confidence bars for top 5 YAMNet results.
 * Updates live as audio is classified.
 */

export default function ClassificationBars({ scores = [] }) {
  // Ensure scores is an array and handle edge cases
  const safeScores = React.useMemo(() => {
    if (!scores) return [];
    if (Array.isArray(scores)) return scores;
    if (typeof scores === 'object') return Object.values(scores);
    return [];
  }, [scores]);
  const getColor = (severity) => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL': return '#FF3B5C';
      case 'HIGH': return '#FF8C00';
      case 'MEDIUM': return '#FFD600';
      default: return '#00E5FF';
    }
  };

  const isIncidentClass = (severity) => {
    return ['CRITICAL', 'HIGH', 'MEDIUM'].includes(severity?.toUpperCase());
  };

  if (!safeScores || safeScores.length === 0) {
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
        {safeScores.map((score, index) => {
          // Only display the human-readable class name unless overridden
          const label = score?.class || score?.sentinel_label || score?.label || String(score) || 'Unknown';
          const confidence = score?.confidence || score?.score || 0;
          const severity = score?.severity || 'LOW';
          const percentage = typeof confidence === 'number' ? (confidence * 100).toFixed(1) : '0.0';
          const color = getColor(severity);
          const isWinner = index === 0;
          const isIncident = isIncidentClass(severity);

          return (
            <div key={label + index} className={`result-bar ${isWinner ? 'winner' : ''}`}>
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
