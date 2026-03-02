import React, { useEffect, useRef } from 'react';

/**
 * WaveformVisualiser — Spec Section 10.2
 * Real-time microphone input waveform animation.
 * Displays live audio waveform that spikes on sound events.
 */

export default function WaveformVisualiser({ analyser, isActive = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!analyser || !isActive) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    let animationId;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      // Clear with fade effect for trail
      ctx.fillStyle = 'rgba(8, 12, 16, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00E5FF'; // Cyan waveform
      ctx.shadowColor = '#00E5FF';
      ctx.shadowBlur = 10;
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    draw();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [analyser, isActive]);

  return (
    <div className="waveform-container">
      <div className="waveform-header">
        <span className="live-indicator">
          <span className="live-dot"></span>
          LIVE INPUT
        </span>
        <span className="waveform-label">Audio Waveform</span>
      </div>
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={120}
        className="waveform-canvas"
      />
    </div>
  );
}
