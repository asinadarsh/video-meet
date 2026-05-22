"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, MonitorUp, Hand } from "lucide-react";
import { avatarColor, initials } from "@/lib/utils";

export function VideoTile({
  stream,
  name,
  audio,
  video,
  screen,
  raisedHand,
  isSelf,
  isHost,
}: {
  stream: MediaStream | null;
  name: string;
  audio: boolean;
  video: boolean;
  screen?: boolean;
  raisedHand?: boolean;
  isSelf?: boolean;
  isHost?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-[var(--surface-2)] aspect-video border border-[var(--border)] group">
      {stream && video ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          className={`w-full h-full object-cover ${isSelf && !screen ? "mirror" : ""}`}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className={`size-20 rounded-full grid place-items-center text-2xl font-semibold text-white ${avatarColor(name || "?")}`}>
            {initials(name || "?")}
          </div>
        </div>
      )}

      {/* Top-right indicators */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {screen && (
          <span className="inline-flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded-md">
            <MonitorUp className="size-3" /> Sharing
          </span>
        )}
        {raisedHand && (
          <span className="inline-flex items-center gap-1 bg-amber-500/90 text-white text-xs px-2 py-1 rounded-md">
            <Hand className="size-3" />
          </span>
        )}
      </div>

      {/* Bottom-left name + mute */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 bg-black/60 text-white text-xs px-2 py-1 rounded-md max-w-[70%]">
          {audio ? <Mic className="size-3 shrink-0" /> : <MicOff className="size-3 shrink-0 text-red-400" />}
          <span className="truncate">
            {name}
            {isSelf ? " (You)" : ""}
            {isHost ? " · Host" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
