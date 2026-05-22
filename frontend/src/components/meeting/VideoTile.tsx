"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, MonitorUp, Hand, Pin, PinOff, Signal, SignalHigh, SignalLow, SignalMedium } from "lucide-react";
import { avatarColor, initials, cn } from "@/lib/utils";
import type { Quality } from "@/hooks/useConnectionQuality";

type Size = "xs" | "sm" | "md" | "lg";

const avatarSizeByTile: Record<Size, string> = {
  xs: "size-10 text-sm",
  sm: "size-14 text-base",
  md: "size-20 text-2xl",
  lg: "size-28 text-3xl",
};

export function VideoTile({
  stream,
  name,
  audio,
  video,
  screen,
  raisedHand,
  isSelf,
  isHost,
  pinned,
  size = "md",
  onTogglePin,
  compact,
  quality,
  speaking,
}: {
  stream: MediaStream | null;
  name: string;
  audio: boolean;
  video: boolean;
  screen?: boolean;
  raisedHand?: boolean;
  isSelf?: boolean;
  isHost?: boolean;
  pinned?: boolean;
  size?: Size;
  onTogglePin?: () => void;
  compact?: boolean;
  quality?: Quality;
  speaking?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Keep <video> ALWAYS mounted so toggling the camera off/on doesn't
  // tear down the element's stream binding. We hide it with opacity
  // when the camera is off and overlay the avatar.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      // Safari sometimes needs an explicit play kick after srcObject swap.
      el.play().catch(() => {});
    }
  }, [stream]);

  // When the camera turns back on after being off, make sure the element
  // resumes playback (some browsers pause when no frames arrive for a bit).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (video) el.play().catch(() => {});
  }, [video]);

  // Screen-shared content needs to be visible in full — contain.
  // Camera fills — cover.
  const objectFit = screen ? "object-contain bg-black" : "object-cover";
  const showVideo = !!stream && video;

  return (
    <div
      className={cn(
        "relative w-full h-full rounded-xl overflow-hidden bg-[var(--surface-2)] border group transition-shadow",
        pinned ? "border-[var(--primary)] border-2" : "border-[var(--border)]",
        speaking ? "ring-2 ring-green-400/80 ring-offset-2 ring-offset-[var(--background)]" : "",
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf}
        className={cn(
          "w-full h-full",
          objectFit,
          isSelf && !screen ? "mirror" : "",
          showVideo ? "opacity-100" : "opacity-0",
          "transition-opacity duration-150",
        )}
      />

      {!showVideo && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--surface-2)]">
          <div
            className={cn(
              "rounded-full grid place-items-center font-semibold text-white",
              avatarSizeByTile[size],
              avatarColor(name || "?"),
            )}
          >
            {initials(name || "?")}
          </div>
        </div>
      )}

      {/* Connection quality dot */}
      {quality && quality !== "unknown" && (
        <div
          className={cn(
            "absolute top-2 right-2 z-10 inline-flex items-center justify-center size-6 rounded-md bg-black/50 backdrop-blur-sm",
            "translate-x-0",
            // when other indicators are present they shift down (handled below)
          )}
          title={`Connection: ${quality}`}
        >
          {quality === "good" && <SignalHigh className="size-3.5 text-green-400" />}
          {quality === "fair" && <SignalMedium className="size-3.5 text-amber-400" />}
          {quality === "poor" && <SignalLow className="size-3.5 text-red-400" />}
        </div>
      )}

      {/* Top-right indicators (shifted left if quality dot is showing) */}
      <div
        className={cn(
          "absolute top-2 flex items-center gap-1",
          quality && quality !== "unknown" ? "right-10" : "right-2",
        )}
      >
        {!compact && screen && (
          <span className="inline-flex items-center gap-1 bg-black/60 text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md">
            <MonitorUp className="size-3" />
            <span className="hidden sm:inline">Sharing</span>
          </span>
        )}
        {raisedHand && (
          <span className="inline-flex items-center gap-1 bg-amber-500/90 text-white text-xs px-1.5 py-0.5 rounded-md">
            <Hand className="size-3" />
          </span>
        )}
        {pinned && !compact && (
          <span className="inline-flex items-center gap-1 bg-[var(--primary)]/90 text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md">
            <Pin className="size-3" />
          </span>
        )}
      </div>

      {/* Hover-only pin button */}
      {onTogglePin && (
        <button
          onClick={onTogglePin}
          className="absolute top-2 left-2 size-8 rounded-md bg-black/50 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center hover:bg-black/70"
          aria-label={pinned ? "Unpin" : "Pin"}
          title={pinned ? "Unpin" : "Pin"}
        >
          {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </button>
      )}

      {/* Bottom name + mute */}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-2 pointer-events-none">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 bg-black/60 text-white rounded-md max-w-[80%]",
            compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1",
          )}
        >
          {audio ? (
            <Mic className="size-3 shrink-0" />
          ) : (
            <MicOff className="size-3 shrink-0 text-red-400" />
          )}
          <span className="truncate">
            {name}
            {isSelf ? " (You)" : ""}
            {!compact && isHost ? " · Host" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
