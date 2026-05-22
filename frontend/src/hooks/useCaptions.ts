"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Args = {
  enabled: boolean;
  audioEnabled: boolean;
  onText: (text: string, final: boolean) => void;
};

/**
 * Web Speech API wrapper. Only available in Chromium-based browsers as
 * webkitSpeechRecognition. Continuously transcribes the user's mic and
 * emits interim + final results.
 */
export function useCaptions({ enabled, audioEnabled, onText }: Args) {
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    const Ctor = getSpeechRecognition();
    setSupported(!!Ctor);
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("Captions are not supported in this browser.");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";

    rec.onresult = (e) => {
      if (!audioEnabled) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript || "";
        if (text.trim()) onTextRef.current(text.trim(), !!r.isFinal);
      }
    };
    rec.onerror = (e) => {
      // common: "no-speech", "audio-capture", "not-allowed"
      if (e.error !== "no-speech") setError(`Captions: ${e.error}`);
    };
    rec.onend = () => {
      // auto-restart if still enabled (some browsers stop after silence)
      if (enabled && recRef.current === rec) {
        try { rec.start(); } catch {}
      }
    };
    try {
      rec.start();
      recRef.current = rec;
    } catch (e) {
      setError((e as Error).message || "Could not start captions");
    }
    return () => {
      recRef.current = null;
      try { rec.stop(); } catch {}
    };
  }, [enabled, audioEnabled, stop]);

  return { supported, error };
}

/* ---------- minimal SpeechRecognition typings ---------- */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }> & Iterable<unknown>;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
