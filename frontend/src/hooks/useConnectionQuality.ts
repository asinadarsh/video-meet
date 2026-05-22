"use client";

import { useEffect, useRef, useState } from "react";

export type Quality = "good" | "fair" | "poor" | "unknown";

/**
 * Polls RTCPeerConnection.getStats every 4s and classifies the link as
 * good/fair/poor based on inbound packet loss + jitter. Returns a Map
 * keyed by peerId.
 */
export function useConnectionQuality(peerConnections: Map<string, RTCPeerConnection>) {
  const [qualities, setQualities] = useState<Map<string, Quality>>(new Map());
  const prevRef = useRef<Map<string, { packetsLost: number; packetsReceived: number }>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = new Map<string, Quality>();
      for (const [id, pc] of peerConnections.entries()) {
        try {
          const stats = await pc.getStats();
          let lost = 0;
          let received = 0;
          let jitter = 0;
          stats.forEach((r) => {
            if (r.type === "inbound-rtp" && r.kind === "video") {
              lost = typeof r.packetsLost === "number" ? r.packetsLost : lost;
              received = typeof r.packetsReceived === "number" ? r.packetsReceived : received;
              jitter = typeof r.jitter === "number" ? r.jitter : jitter;
            }
          });
          const prev = prevRef.current.get(id) || { packetsLost: 0, packetsReceived: 0 };
          const dLost = Math.max(0, lost - prev.packetsLost);
          const dRecv = Math.max(0, received - prev.packetsReceived);
          prevRef.current.set(id, { packetsLost: lost, packetsReceived: received });

          const totalDelta = dLost + dRecv;
          const lossRatio = totalDelta > 0 ? dLost / totalDelta : 0;

          let q: Quality;
          if (totalDelta === 0) q = "unknown";
          else if (lossRatio > 0.08 || jitter > 0.05) q = "poor";
          else if (lossRatio > 0.03 || jitter > 0.025) q = "fair";
          else q = "good";

          next.set(id, q);
        } catch {
          next.set(id, "unknown");
        }
      }
      if (!cancelled) setQualities(next);
    };
    const interval = setInterval(tick, 4000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [peerConnections]);

  return qualities;
}
