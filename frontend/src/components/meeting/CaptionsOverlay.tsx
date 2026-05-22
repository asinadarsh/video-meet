"use client";

import { useEffect, useState } from "react";

export type CaptionLine = {
  id: number;
  from: string;
  name: string;
  text: string;
  ts: number;
};

/**
 * Floating captions strip at the bottom of the meeting stage.
 * Shows up to 3 most-recent lines, each fading after ~6s.
 */
export function CaptionsOverlay({ lines }: { lines: CaptionLine[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);

  const recent = lines.filter((l) => now - l.ts < 6000).slice(-3);
  if (recent.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 bottom-4 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5 max-w-[90%]">
      {recent.map((l) => {
        const age = now - l.ts;
        const opacity = age > 4500 ? Math.max(0, 1 - (age - 4500) / 1500) : 1;
        return (
          <div
            key={l.id}
            style={{ opacity }}
            className="px-3 py-1.5 rounded-lg bg-black/75 backdrop-blur-sm text-white text-sm sm:text-base shadow-lg max-w-2xl"
          >
            <span className="text-xs text-white/60 mr-2">{l.name}</span>
            {l.text}
          </div>
        );
      })}
    </div>
  );
}
