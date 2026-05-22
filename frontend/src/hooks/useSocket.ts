"use client";

import { useEffect, useRef, useState } from "react";
import { WS_BASE } from "@/lib/api";

export type SocketState = "idle" | "connecting" | "open" | "closed";

export function useSocket(
  meetingId: string | null,
  participantId: string | null,
  onMessage: (msg: any) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<SocketState>("idle");
  const handlerRef = useRef(onMessage);

  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!meetingId || !participantId) return;

    setState("connecting");
    const url = `${WS_BASE}/ws/meetings/${meetingId}?participant_id=${encodeURIComponent(participantId)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setState("open");
    ws.onclose = () => setState("closed");
    ws.onerror = () => setState("closed");
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handlerRef.current?.(data);
      } catch {}
    };

    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
      setState("closed");
    };
  }, [meetingId, participantId]);

  const send = (msg: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  return { state, send };
}
