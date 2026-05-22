"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "recording" | "stopping";

/**
 * Wraps MediaRecorder to record a single MediaStream (typically the
 * user's own combined audio+video stream). Stops produce a webm file
 * the browser auto-downloads.
 */
export function useRecorder(stream: MediaStream | null, baseFilename: string) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    setState("stopping");
    rec.stop();
  }, []);

  const start = useCallback(() => {
    if (!stream) {
      setError("No stream to record");
      return;
    }
    setError(null);
    chunksRef.current = [];

    const mime = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 })
                 : new MediaRecorder(stream);
    } catch (e) {
      setError((e as Error).message || "MediaRecorder is not supported in this browser");
      return;
    }

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `${baseFilename}-${ts}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      chunksRef.current = [];
      setState("idle");
    };
    rec.onerror = (e) => {
      console.error("MediaRecorder error", e);
      setError("Recording failed");
      setState("idle");
    };

    recorderRef.current = rec;
    // Use a generous timeslice so chunks are persisted progressively
    rec.start(1000);
    setState("recording");
  }, [stream, baseFilename]);

  useEffect(() => () => {
    try { recorderRef.current?.stop(); } catch {}
  }, []);

  return { state, error, start, stop };
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}
