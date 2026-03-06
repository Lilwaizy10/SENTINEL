import React, { useState, useRef } from 'react';

/**
 * LiveDemoButton — Spec Section 10.7
 *
 * FIX 1: onActivate/onChunk split (carried over from previous fix)
 * FIX 2: MIME type fallback (carried over)
 *
 * FIX BUG 3 — CUMULATIVE BLOB:
 *   Original: chunksRef accumulated ALL chunks, sent entire recording each tick.
 *   After 60s this sent a 60-second blob every second, causing:
 *     - Memory growth unbounded (all chunks held in RAM)
 *     - ffmpeg conversion getting progressively slower
 *     - Backend classifying 60s of ambient audio, not the latest 1s event
 *
 *   WebM structure: chunk[0] is the init segment (cluster header, ~2-4KB).
 *   Without it, subsequent chunks aren't valid standalone WebM files for ffmpeg.
 *   Fix: store chunk[0] as headerChunkRef, then each POST sends
 *   [header + latest_chunk_only] — a constant ~18-20KB valid WebM file.
 */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
];

function getSupportedMimeType() {
  for (const type of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export default function LiveDemoButton({
  onActivate,
  onChunk,
  onDeactivate,
  isActive = false,
}) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError]               = useState(null);
  const streamRef        = useRef(null);
  const audioContextRef  = useRef(null);
  const analyserRef      = useRef(null);
  const mediaRecorderRef = useRef(null);
  const headerChunkRef   = useRef(null);  // FIX BUG 3: WebM init segment
  const chunkCountRef    = useRef(0);     // FIX BUG 3: chunk index

  const isSupported = () => {
    if (!navigator.mediaDevices?.getUserMedia)
      return { supported: false, reason: 'Browser does not support microphone access' };
    if (typeof MediaRecorder === 'undefined')
      return { supported: false, reason: 'Browser does not support MediaRecorder' };
    return { supported: true };
  };

  const activateLiveMode = async () => {
    headerChunkRef.current = null;
    chunkCountRef.current  = 0;
    setError(null);
    setIsRequesting(true);

    const support = isSupported();
    if (!support.supported) {
      setError(support.reason);
      setIsRequesting(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
          channelCount:     1,
        },
      });

      if (!stream?.getAudioTracks().length) throw new Error('No audio tracks in stream');

      streamRef.current = stream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const mimeType = getSupportedMimeType();
      console.log('[LiveDemo] Using MIME type:', mimeType || '(browser default)');

      const recorderOptions = { audioBitsPerSecond: 128000 };
      if (mimeType) recorderOptions.mimeType = mimeType;

      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;

        const idx = chunkCountRef.current++;

        if (idx === 0) {
          // FIX BUG 3: Store WebM init segment — every subsequent POST prepends
          // it so ffmpeg receives a valid standalone WebM file each time.
          headerChunkRef.current = event.data;
          console.log(`[LiveDemo] WebM header: ${event.data.size}B — not sending alone`);
          return; // No audio frames in init segment yet
        }

        if (!onChunk) return;

        // FIX BUG 3: [header + this_chunk_only] — constant size every POST
        const mtype = mediaRecorder.mimeType || 'audio/webm';
        const blob  = headerChunkRef.current
          ? new Blob([headerChunkRef.current, event.data], { type: mtype })
          : new Blob([event.data], { type: mtype });

        console.log(`[LiveDemo] chunk #${idx}: ${blob.size}B`);
        onChunk(blob);
      };

      mediaRecorder.onerror = (event) => {
        console.error('[LiveDemo] MediaRecorder error:', event.error);
        setError('Recording error: ' + (event.error?.message || event.error));
      };

      // timeslice=1000: chunk[0]=init header, chunk[1+]=1s audio each
      mediaRecorder.start(3000);
      setIsRequesting(false);

      if (onActivate) onActivate(analyser, audioContext, stream);

    } catch (err) {
      console.error('[LiveDemo] Failed to access microphone:', err);
      setIsRequesting(false);

      let msg = 'Microphone access denied. ';
      if (err.name === 'NotAllowedError')      msg += 'Please allow microphone permissions in your browser settings.';
      else if (err.name === 'NotFoundError')   msg += 'No microphone device found.';
      else if (err.name === 'NotReadableError') msg += 'Microphone is in use by another application.';
      else msg += err.message || 'Please enable microphone permissions and try again.';

      setError(msg);
      if (onDeactivate) onDeactivate();
    }
  };

  const deactivateLiveMode = () => {
    headerChunkRef.current = null;
    chunkCountRef.current  = 0;

    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (onDeactivate) onDeactivate();
  };

  const toggleLiveMode = () => {
    if (isActive) deactivateLiveMode();
    else activateLiveMode();
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={toggleLiveMode}
        disabled={isRequesting}
        className={`live-demo-button ${isActive ? 'active' : ''} ${isRequesting ? 'requesting' : ''}`}
      >
        {isRequesting ? (
          <><span className="spinner" /> Requesting Access...</>
        ) : isActive ? (
          <><span className="live-badge"><span className="live-dot" /></span> LIVE DEMO</>
        ) : (
          <><span>🎤</span> ACTIVATE LIVE DEMO</>
        )}
      </button>

      {error && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '8px',
          padding: '8px 12px', backgroundColor: '#FF3B5C', color: 'white',
          borderRadius: '6px', fontSize: '0.75rem', maxWidth: '300px', zIndex: 1000,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}