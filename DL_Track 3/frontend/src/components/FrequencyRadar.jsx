import React, { useState, useEffect } from 'react';

/**
 * FrequencyRadar — Spec Section 10.6
 * Radar/spider chart showing live frequency band energy distribution.
 * Updates every 100ms with current frequency spectrum from analyser.
 */

export default function FrequencyRadar({ analyser, isActive = false }) {
  const [data, setData] = useState([
    { band: 'Bass', energy: 0 },
    { band: 'Low-Mid', energy: 0 },
    { band: 'Mid', energy: 0 },
    { band: 'High-Mid', energy: 0 },
    { band: 'High', energy: 0 },
  ]);

  useEffect(() => {
    if (!analyser || !isActive) {
      // Reset when inactive
      setData(data.map(d => ({ ...d, energy: 0 })));
      return;
    }

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    let animationFrame;

    const update = () => {
      analyser.getByteFrequencyData(freqData);
      const len = freqData.length;

      // Calculate average energy for each frequency band
      const bands = [
        { name: 'Bass', start: 0, end: len * 0.05 },
        { name: 'Low-Mid', start: len * 0.05, end: len * 0.2 },
        { name: 'Mid', start: len * 0.2, end: len * 0.4 },
        { name: 'High-Mid', start: len * 0.4, end: len * 0.7 },
        { name: 'High', start: len * 0.7, end: len },
      ];

      const newData = bands.map(({ name, start, end }) => {
        const sum = freqData.slice(Math.floor(start), Math.floor(end))
          .reduce((a, b) => a + b, 0);
        const count = Math.floor(end) - Math.floor(start);
        const avg = count > 0 ? sum / count : 0;
        return { band: name, energy: Math.round(avg) };
      });

      setData(newData);
      animationFrame = requestAnimationFrame(update);
    };

    update();

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [analyser, isActive]);

  // Simple SVG radar chart implementation
  const size = 280;
  const center = size / 2;
  const radius = (size / 2) - 40;
  const bands = data.map(d => d.band);
  const angleStep = (Math.PI * 2) / bands.length;

  // Calculate polygon points
  const points = data.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (d.energy / 255) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  // Calculate axis lines
  const axes = bands.map((band, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return (
      <line
        key={`axis-${i}`}
        x1={center}
        y1={center}
        x2={x}
        y2={y}
        stroke="#1e2d3d"
        strokeWidth="1"
      />
    );
  });

  // Label positions
  const labels = bands.map((band, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const x = center + (radius + 15) * Math.cos(angle);
    const y = center + (radius + 15) * Math.sin(angle);
    return (
      <text
        key={`label-${i}`}
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#5a7a95"
        fontSize="11"
        fontFamily="monospace"
      >
        {band}
      </text>
    );
  });

  return (
    <div className="frequency-radar-container">
      <div className="radar-header">
        <span>📊 Acoustic Fingerprint</span>
        <span className="radar-status">{isActive ? 'LIVE' : 'STANDBY'}</span>
      </div>
      <div className="radar-chart">
        <svg width={size} height={size} className="radar-svg">
          {/* Concentric circles */}
          {[0.25, 0.5, 0.75, 1].map((scale, i) => (
            <circle
              key={`circle-${i}`}
              cx={center}
              cy={center}
              r={radius * scale}
              fill="none"
              stroke="#1e2d3d"
              strokeWidth="1"
              strokeDasharray={scale === 1 ? '0' : '4, 4'}
            />
          ))}
          
          {/* Axis lines */}
          {axes}
          
          {/* Data polygon */}
          <polygon
            points={points}
            fill="rgba(0, 229, 255, 0.25)"
            stroke="#00E5FF"
            strokeWidth="2"
            className="radar-polygon"
          />
          
          {/* Labels */}
          {labels}
        </svg>
      </div>
      <div className="radar-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#00E5FF' }}></span>
          <span>Current Energy</span>
        </div>
        <div className="legend-item">
          <span className="legend-label">Peak: {Math.max(...data.map(d => d.energy))}</span>
        </div>
      </div>
    </div>
  );
}
