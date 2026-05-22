"use client";

import { useEffect, useRef } from "react";

/**
 * Measures the user's microphone volume via Web Audio AnalyserNode and
 * fires `onLevel(0..1)` ~5x/sec. Used to broadcast active-speaker hints
 * over the socket so peers can highlight whoever is talking.
 *
 * Skips broadcasts when the audio track is disabled.
 */
export function useActiveSpeaker(
  stream: MediaStream | null,
  audioEnabled: boolean,
  onLevel: (value: number) => void,
) {
  const onLevelRef = useRef(onLevel);
  onLevelRef.current = onLevel;
  const enabledRef = useRef(audioEnabled);
  enabledRef.current = audioEnabled;

  useEffect(() => {
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    let ac: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let raf = 0;
    let lastEmit = 0;
    let lastEmitted = -1;

    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new Ctor();
      const audioOnly = new MediaStream(audioTracks);
      source = ac.createMediaStreamSource(audioOnly);
      analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
    } catch (e) {
      console.warn("AudioContext init failed", e);
      return;
    }

    const buf = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (!analyser) return;
      analyser.getByteFrequencyData(buf);
      // RMS-ish loudness
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length) / 255;
      const level = enabledRef.current ? Math.min(1, rms * 1.8) : 0;

      const now = performance.now();
      // Emit at ~5 Hz, only when the level meaningfully changed
      if (now - lastEmit > 200) {
        if (Math.abs(level - lastEmitted) > 0.06 || (level === 0 && lastEmitted !== 0)) {
          onLevelRef.current(level);
          lastEmitted = level;
          lastEmit = now;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      try { source?.disconnect(); } catch {}
      try { analyser?.disconnect(); } catch {}
      try { ac?.close(); } catch {}
    };
  }, [stream]);
}
