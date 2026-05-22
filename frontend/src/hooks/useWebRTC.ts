"use client";

/**
 * Mesh WebRTC manager.
 *
 * One RTCPeerConnection per remote peer. Signaling is delegated to a
 * `sendSignal` callback (typically the WebSocket). The hook is driven by
 * remote signaling events forwarded via `onSignal`, and by the
 * participant list (which it watches to open/close connections).
 *
 * Roles:
 *   - When a peer joins AFTER us, we are the offerer.
 *   - When we receive an offer first, we are the answerer.
 *   This avoids glare without requiring perfect-negotiation logic for MVP.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type RemotePeer = {
  participant_id: string;
  name: string;
  stream: MediaStream | null;
  audio: boolean;
  video: boolean;
  screen: boolean;
  raisedHand: boolean;
};

type SignalPayload =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

type Args = {
  selfId: string | null;
  localStream: MediaStream | null;
  sendSignal: (target: string, payload: SignalPayload) => void;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Per-peer video bitrate ceiling. WebRTC's default starts low and ramps
// slowly — explicit caps make the encoder commit to a higher resolution.
const MAX_VIDEO_BITRATE = 2_500_000; // 2.5 Mbps
const MAX_VIDEO_FRAMERATE = 30;

async function tunePeerVideoQuality(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== "video") continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = MAX_VIDEO_BITRATE;
      params.encodings[0].maxFramerate = MAX_VIDEO_FRAMERATE;
      // degrade resolution last, prefer keeping it crisp at lower fps
      params.degradationPreference = "maintain-resolution";
      await sender.setParameters(params);
    } catch (e) {
      console.warn("setParameters failed", e);
    }
  }
}

export function useWebRTC({ selfId, localStream, sendSignal }: Args) {
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [peers, setPeers] = useState<Map<string, RemotePeer>>(new Map());
  const sendSignalRef = useRef(sendSignal);
  sendSignalRef.current = sendSignal;

  const updatePeer = useCallback((id: string, patch: Partial<RemotePeer>) => {
    setPeers((prev) => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, ...patch });
      return next;
    });
  }, []);

  const ensurePeer = useCallback(
    (id: string, name: string): RTCPeerConnection => {
      let pc = pcs.current.get(id);
      if (pc) return pc;

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcs.current.set(id, pc);

      setPeers((prev) => {
        if (prev.has(id)) return prev;
        const next = new Map(prev);
        next.set(id, {
          participant_id: id,
          name,
          stream: null,
          audio: true,
          video: true,
          screen: false,
          raisedHand: false,
        });
        return next;
      });

      // attach local tracks
      if (localStream) {
        localStream.getTracks().forEach((t) => pc!.addTrack(t, localStream));
      }

      pc.ontrack = (e) => {
        // Combine all incoming tracks into a single stream per peer
        const stream =
          e.streams[0] ??
          (() => {
            const s = new MediaStream();
            s.addTrack(e.track);
            return s;
          })();
        updatePeer(id, { stream });
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignalRef.current(id, { kind: "ice", candidate: e.candidate.toJSON() });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc!.connectionState;
        if (state === "connected") {
          // Now that SDP is negotiated, push our quality preferences.
          tunePeerVideoQuality(pc!);
        } else if (state === "failed" || state === "closed") {
          closePeer(id);
        }
      };

      return pc;
    },
    [localStream, updatePeer],
  );

  const closePeer = useCallback((id: string) => {
    const pc = pcs.current.get(id);
    if (pc) {
      try {
        pc.close();
      } catch {}
      pcs.current.delete(id);
    }
    setPeers((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const initiateOffer = useCallback(
    async (id: string, name: string) => {
      if (!selfId) return;
      const pc = ensurePeer(id, name);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignalRef.current(id, { kind: "offer", sdp: offer });
      } catch (e) {
        console.error("createOffer failed", e);
      }
    },
    [ensurePeer, selfId],
  );

  const handleSignal = useCallback(
    async (from: string, fromName: string, payload: SignalPayload) => {
      const pc = ensurePeer(from, fromName);
      try {
        if (payload.kind === "offer") {
          await pc.setRemoteDescription(payload.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignalRef.current(from, { kind: "answer", sdp: answer });
        } else if (payload.kind === "answer") {
          if (pc.signalingState !== "stable") {
            await pc.setRemoteDescription(payload.sdp);
          }
        } else if (payload.kind === "ice") {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch (e) {
            console.warn("addIceCandidate failed", e);
          }
        }
      } catch (e) {
        console.error("handleSignal error", e);
      }
    },
    [ensurePeer],
  );

  // Replace video track everywhere (used for screen-share toggle)
  const replaceVideoTrack = useCallback(async (newTrack: MediaStreamTrack | null) => {
    for (const pc of pcs.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        try {
          await sender.replaceTrack(newTrack);
        } catch (e) {
          console.warn("replaceTrack failed", e);
        }
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const id of Array.from(pcs.current.keys())) closePeer(id);
    };
  }, [closePeer]);

  return {
    peers,
    initiateOffer,
    handleSignal,
    closePeer,
    updatePeer,
    replaceVideoTrack,
  };
}
