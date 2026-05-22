"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MediaState = {
  stream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  error: string | null;
};

export function useMedia(initial: { audio: boolean; video: boolean }) {
  const [state, setState] = useState<MediaState>({
    stream: null,
    audioEnabled: initial.audio,
    videoEnabled: initial.video,
    error: null,
  });
  const startedRef = useRef(false);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      stream.getAudioTracks().forEach((t) => (t.enabled = initial.audio));
      stream.getVideoTracks().forEach((t) => (t.enabled = initial.video));
      setState((s) => ({ ...s, stream, error: null }));
    } catch (e: any) {
      setState((s) => ({ ...s, error: e?.message || "Could not access camera/microphone" }));
      startedRef.current = false;
    }
  }, [initial.audio, initial.video]);

  const toggleAudio = useCallback(() => {
    setState((s) => {
      if (!s.stream) return s;
      const next = !s.audioEnabled;
      s.stream.getAudioTracks().forEach((t) => (t.enabled = next));
      return { ...s, audioEnabled: next };
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setState((s) => {
      if (!s.stream) return s;
      const next = !s.videoEnabled;
      s.stream.getVideoTracks().forEach((t) => (t.enabled = next));
      return { ...s, videoEnabled: next };
    });
  }, []);

  const forceMute = useCallback(() => {
    setState((s) => {
      if (!s.stream) return s;
      s.stream.getAudioTracks().forEach((t) => (t.enabled = false));
      return { ...s, audioEnabled: false };
    });
  }, []);

  useEffect(() => {
    return () => {
      state.stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, start, toggleAudio, toggleVideo, forceMute };
}
