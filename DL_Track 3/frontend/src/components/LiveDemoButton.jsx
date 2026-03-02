import React, { useState, useRef } from 'react';

/**
 * LiveDemoButton — Spec Section 10.7
 * Prominent button to activate live microphone demo mode.
 * Requests mic permission, starts waveform visualiser, begins classification.
 */

export default function LiveDemoButton({ onActivate, onDeactivate, isActive = false }) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  // Check browser support
  const isSupported = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { supported: false, reason: 'Browser does not support microphone access' };
    }
    if (typeof MediaRecorder === 'undefined') {
      return { supported: false, reason: 'Browser does not support MediaRecorder' };
    }
    return { supported: true };
  };

  const activateLiveMode = async () => {
    setError(null);
    setIsRequesting(true);

    // Check browser support
    const support = isSupported();
    if (!support.supported) {
      setError(support.reason);
      setIsRequesting(false);
      alert(support.reason);
      return;
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1,
        }
      });

      // Verify stream is valid
      if (!stream || !stream.getAudioTracks().length) {
        throw new Error('No audio tracks in stream');
      }

      streamRef.current = stream;

      // Create audio context for analysis
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      // Create analyser node
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      // Connect source to analyser
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Create MediaRecorder with valid stream
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });
      mediaRecorderRef.current = mediaRecorder;

      // Handle data available
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0) {
          if (onActivate) {
            await onActivate(event.data, analyser);
          }
        }
      };

      // Handle recording errors
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        setError('Recording error: ' + event.error);
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        console.log('Recording stopped');
      };

      // Record in 1-second chunks
      mediaRecorder.start(1000);

      setIsRequesting(false);

      // Notify parent component with all required objects
      if (onActivate) {
        onActivate(null, analyser, audioContext, stream);
      }

    } catch (err) {
      console.error('Failed to access microphone:', err);
      setIsRequesting(false);
      
      let errorMessage = 'Microphone access denied. ';
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Please allow microphone permissions in your browser settings.';
      } else if (err.name === 'NotFoundError') {
        errorMessage += 'No microphone device found.';
      } else if (err.name === 'NotReadableError') {
        errorMessage += 'Microphone is being used by another application.';
      } else {
        errorMessage += 'Please enable microphone permissions and try again.';
      }
      
      setError(errorMessage);
      alert(errorMessage);
      
      if (onDeactivate) {
        onDeactivate();
      }
    }
  };

  const deactivateLiveMode = () => {
    // Stop media recorder
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;

    if (onDeactivate) {
      onDeactivate();
    }
  };

  const toggleLiveMode = () => {
    if (isActive) {
      deactivateLiveMode();
    } else {
      activateLiveMode();
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={toggleLiveMode}
        disabled={isRequesting}
        className={`live-demo-button ${isActive ? 'active' : ''} ${isRequesting ? 'requesting' : ''}`}
      >
        {isRequesting ? (
          <>
            <span className="spinner"></span>
            Requesting Access...
          </>
        ) : isActive ? (
          <>
            <span className="live-badge">
              <span className="live-dot"></span>
            </span>
            LIVE DEMO
          </>
        ) : (
          <>
            <span>🎤</span>
            ACTIVATE LIVE DEMO
          </>
        )}
      </button>
      {error && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '8px',
          padding: '8px 12px',
          backgroundColor: '#FF3B5C',
          color: 'white',
          borderRadius: '6px',
          fontSize: '0.75rem',
          maxWidth: '300px',
          zIndex: 1000,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
