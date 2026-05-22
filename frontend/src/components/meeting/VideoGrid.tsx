"use client";

import { useEffect, useState } from "react";
import { VideoTile } from "./VideoTile";

export type TileData = {
  id: string;
  stream: MediaStream | null;
  name: string;
  audio: boolean;
  video: boolean;
  screen?: boolean;
  raisedHand?: boolean;
  isSelf?: boolean;
  isHost?: boolean;
};

export type ViewMode = "gallery" | "speaker";

type Props = {
  mode: ViewMode;
  tiles: TileData[];
  spotlightId: string | null;
  pinnedId: string | null;
  onTogglePin: (id: string) => void;
};

/**
 * Adaptive layout:
 *   - gallery: smart NxM grid sized per participant count + viewport
 *   - speaker: one spotlight tile + thumbnail strip (horizontal on
 *     mobile / vertical on desktop)
 */
export function VideoGrid({
  mode,
  tiles,
  spotlightId,
  pinnedId,
  onTogglePin,
}: Props) {
  if (tiles.length === 0) {
    return (
      <div className="h-full grid place-items-center text-[var(--muted)] text-sm">
        Waiting for participants…
      </div>
    );
  }

  if (mode === "speaker") {
    return (
      <SpeakerLayout
        tiles={tiles}
        spotlightId={spotlightId}
        pinnedId={pinnedId}
        onTogglePin={onTogglePin}
      />
    );
  }
  return (
    <GalleryLayout
      tiles={tiles}
      pinnedId={pinnedId}
      onTogglePin={onTogglePin}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Gallery                                                             */
/* ------------------------------------------------------------------ */

function GalleryLayout({
  tiles,
  pinnedId,
  onTogglePin,
}: {
  tiles: TileData[];
  pinnedId: string | null;
  onTogglePin: (id: string) => void;
}) {
  const isMobile = useIsMobile();

  // Hard cap visible tiles → keep faces large even in big meetings.
  // The overflow tile shows "+N more"; users can switch to speaker view
  // or open the participants panel for the full list.
  const CAP = isMobile ? 6 : 16;
  const overflow = tiles.length - CAP;
  const visible = overflow > 0 ? tiles.slice(0, CAP - 1) : tiles;

  const layout = pickGalleryLayout(visible.length + (overflow > 0 ? 1 : 0), isMobile);
  const tileSize = sizeForCount(visible.length + (overflow > 0 ? 1 : 0));

  return (
    <div className="h-full w-full grid place-items-center">
      <div
        className="grid w-full h-full max-w-[1600px] gap-2 sm:gap-3"
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
        }}
      >
        {visible.map((t) => (
          <div key={t.id} className="min-h-0 min-w-0">
            <VideoTile
              stream={t.stream}
              name={t.name}
              audio={t.audio}
              video={t.video}
              screen={t.screen}
              raisedHand={t.raisedHand}
              isSelf={t.isSelf}
              isHost={t.isHost}
              pinned={t.id === pinnedId}
              size={tileSize}
              onTogglePin={() => onTogglePin(t.id)}
            />
          </div>
        ))}
        {overflow > 0 && (
          <div className="min-h-0 min-w-0">
            <OverflowTile count={overflow + 1} />
          </div>
        )}
      </div>
    </div>
  );
}

function OverflowTile({ count }: { count: number }) {
  return (
    <div className="relative w-full h-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] grid place-items-center text-center p-3">
      <div>
        <div className="text-2xl sm:text-3xl font-semibold">+{count}</div>
        <div className="text-xs sm:text-sm text-[var(--muted)] mt-1">more in this meeting</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Speaker                                                             */
/* ------------------------------------------------------------------ */

function SpeakerLayout({
  tiles,
  spotlightId,
  pinnedId,
  onTogglePin,
}: {
  tiles: TileData[];
  spotlightId: string | null;
  pinnedId: string | null;
  onTogglePin: (id: string) => void;
}) {
  // Resolve spotlight: explicit → first non-self → fallback to self.
  const featured =
    tiles.find((t) => t.id === spotlightId) ??
    tiles.find((t) => !t.isSelf) ??
    tiles[0];
  const rest = tiles.filter((t) => t.id !== featured.id);
  const isMobile = useIsMobile();

  return (
    <div
      className={
        isMobile
          ? "h-full flex flex-col gap-2"
          : "h-full flex gap-3"
      }
    >
      <div className="flex-1 min-w-0 min-h-0">
        <VideoTile
          stream={featured.stream}
          name={featured.name}
          audio={featured.audio}
          video={featured.video}
          screen={featured.screen}
          raisedHand={featured.raisedHand}
          isSelf={featured.isSelf}
          isHost={featured.isHost}
          pinned={featured.id === pinnedId}
          size="lg"
          onTogglePin={() => onTogglePin(featured.id)}
        />
      </div>

      {rest.length > 0 && (
        <div
          className={
            isMobile
              ? "flex gap-2 overflow-x-auto pb-1 snap-x flex-shrink-0"
              : "w-44 lg:w-56 flex flex-col gap-2 overflow-y-auto flex-shrink-0"
          }
        >
          {rest.map((t) => (
            <div
              key={t.id}
              className={
                isMobile
                  ? "snap-start w-32 sm:w-40 aspect-video flex-shrink-0"
                  : "aspect-video flex-shrink-0"
              }
            >
              <VideoTile
                stream={t.stream}
                name={t.name}
                audio={t.audio}
                video={t.video}
                screen={t.screen}
                raisedHand={t.raisedHand}
                isSelf={t.isSelf}
                isHost={t.isHost}
                pinned={t.id === pinnedId}
                size="sm"
                compact
                onTogglePin={() => onTogglePin(t.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function pickGalleryLayout(count: number, isMobile: boolean): { cols: number; rows: number } {
  if (isMobile) {
    if (count <= 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 1, rows: 2 };
    if (count <= 4) return { cols: 2, rows: 2 };
    return { cols: 2, rows: 3 }; // capped at 6
  }
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  if (count <= 12) return { cols: 4, rows: 3 };
  return { cols: 4, rows: 4 }; // capped at 16
}

function sizeForCount(count: number): "sm" | "md" | "lg" {
  if (count <= 1) return "lg";
  if (count <= 4) return "md";
  return "sm";
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return isMobile;
}
