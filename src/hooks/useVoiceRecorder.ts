import { useCallback, useEffect, useRef, useState } from 'react';

// Records one short voice clip with MediaRecorder for 語音輸入.
//
// - Mono, speech-tuned (echo cancellation + noise suppression), low bitrate:
//   60s of opus/AAC stays a few hundred KB, so the upload is quick on mobile.
// - Auto-stops at maxMs so a forgotten recording can't run on.
// - Always releases the microphone (the red recording dot) when it stops.

export const VOICE_MAX_MS = 60_000;
// Shorter than this is almost always an accidental tap — not worth a request.
export const VOICE_MIN_MS = 700;

export type RecorderError = 'unsupported' | 'denied' | 'no_mic' | 'failed';

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

export function voiceRecordingSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export interface VoiceClip { blob: Blob; durationMs: number }

export function useVoiceRecorder({ maxMs = VOICE_MAX_MS, onClip }: { maxMs?: number; onClip: (clip: VoiceClip) => void }) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<RecorderError | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const onClipRef = useRef(onClip);
  onClipRef.current = onClip;

  const release = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    else release();
  }, [release]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    setError(null);
    if (!voiceRecordingSupported()) {
      setError('unsupported');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' ? 'no_mic' : 'failed');
      return;
    }
    let rec: MediaRecorder;
    try {
      const mimeType = pickMimeType();
      rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24000 });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError('unsupported');
      return;
    }
    streamRef.current = stream;
    recorderRef.current = rec;
    chunksRef.current = [];
    cancelledRef.current = false;
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      const durationMs = Math.min(maxMs, Date.now() - startedAtRef.current);
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
      chunksRef.current = [];
      release();
      if (!cancelledRef.current) onClipRef.current({ blob, durationMs });
    };
    rec.onerror = () => {
      cancelledRef.current = true;
      setError('failed');
      release();
    };
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    // Timeslice so Safari flushes data regularly instead of only at stop.
    rec.start(1000);
    setRecording(true);
    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsedMs(ms);
      if (ms >= maxMs) stop();
    }, 250);
  }, [maxMs, release, stop]);

  // Leaving the screen mid-recording must not keep the microphone open.
  useEffect(() => () => {
    cancelledRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
  }, []);

  return { recording, elapsedMs, error, start, stop, cancel, clearError: () => setError(null) };
}
