"use client";

import { useEffect, useRef, useState } from "react";
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

const TILE_ASPECT = 16 / 9;

/**
 * Adaptive layout:
 *   - gallery: NxM grid where every tile keeps a 16:9 aspect ratio and
 *     is sized to be as large as possible in the available space. The
 *     grid is centered on both axes so 2-person calls don't stretch tiles
 *     into awkward shapes.
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { width, height } = useContainerSize(containerRef);
  const isMobile = width > 0 && width < 768;

  // Hard cap visible tiles → keep faces large even in big meetings.
  const CAP = isMobile ? 6 : 16;
  const overflow = tiles.length - CAP;
  const visibleTiles = overflow > 0 ? tiles.slice(0, CAP - 1) : tiles;
  const visibleCount = visibleTiles.length + (overflow > 0 ? 1 : 0);

  const GAP = 12;
  const { cols, rows, tileW, tileH } = pickBestLayout(
    visibleCount,
    width,
    height,
    GAP,
    isMobile,
  );
  const tileSize = sizeForTileWidth(tileW);

  return (
    <div ref={containerRef} className="h-full w-full grid place-items-center">
      {width > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, ${tileW}px)`,
            gridTemplateRows: `repeat(${rows}, ${tileH}px)`,
            gap: `${GAP}px`,
            justifyContent: "center",
            alignContent: "center",
          }}
        >
          {visibleTiles.map((t) => (
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
      )}
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
  const featured =
    tiles.find((t) => t.id === spotlightId) ??
    tiles.find((t) => !t.isSelf) ??
    tiles[0];
  const rest = tiles.filter((t) => t.id !== featured.id);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const { width } = useContainerSize(containerRef);
  const isMobile = width > 0 && width < 768;

  return (
    <div
      ref={containerRef}
      className={
        isMobile ? "h-full flex flex-col gap-2" : "h-full flex gap-3"
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
/* Layout math                                                         */
/* ------------------------------------------------------------------ */

type Layout = { cols: number; rows: number; tileW: number; tileH: number };

/**
 * Try a small set of (cols, rows) candidates that can hold `count` tiles
 * and pick the one that yields the largest tile area while keeping every
 * tile at 16:9.
 */
function pickBestLayout(
  count: number,
  width: number,
  height: number,
  gap: number,
  isMobile: boolean,
): Layout {
  if (count === 0 || width === 0 || height === 0) {
    return { cols: 1, rows: 1, tileW: 0, tileH: 0 };
  }

  const candidates: Array<{ cols: number; rows: number }> = [];
  // Generate sensible row/col combos. On mobile prefer narrower grids.
  const maxCols = isMobile ? 2 : 5;
  for (let cols = 1; cols <= maxCols; cols++) {
    const rows = Math.ceil(count / cols);
    candidates.push({ cols, rows });
  }
  // Also a couple of taller options so the auto-fit doesn't always
  // prefer wide-and-short layouts.
  for (let rows = 1; rows <= 4; rows++) {
    const cols = Math.ceil(count / rows);
    if (cols <= maxCols) candidates.push({ cols, rows });
  }

  let best: Layout = { cols: 1, rows: count, tileW: 0, tileH: 0 };
  for (const { cols, rows } of candidates) {
    if (cols * rows < count) continue;
    const availW = width - gap * (cols - 1);
    const availH = height - gap * (rows - 1);
    if (availW <= 0 || availH <= 0) continue;
    const maxTileW = availW / cols;
    const maxTileH = availH / rows;
    // largest 16:9 tile that fits within (maxTileW, maxTileH)
    const tileW = Math.floor(Math.min(maxTileW, maxTileH * TILE_ASPECT));
    const tileH = Math.floor(tileW / TILE_ASPECT);
    if (tileW > best.tileW) best = { cols, rows, tileW, tileH };
  }
  return best;
}

function sizeForTileWidth(tileW: number): "xs" | "sm" | "md" | "lg" {
  if (tileW < 180) return "xs";
  if (tileW < 320) return "sm";
  if (tileW < 560) return "md";
  return "lg";
}

function useContainerSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
