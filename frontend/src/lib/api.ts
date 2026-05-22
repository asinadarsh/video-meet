import type {
  ChatMessage,
  JoinResponse,
  Meeting,
  MeetingCreated,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  createInstant: (body: {
    host_name: string;
    title?: string;
    description?: string;
    duration_minutes?: number;
  }) =>
    http<MeetingCreated>("/api/meetings", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  schedule: (body: {
    host_name: string;
    title: string;
    description?: string;
    scheduled_for: string;
    duration_minutes?: number;
  }) =>
    http<MeetingCreated>("/api/meetings/schedule", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  get: (meetingId: string) => http<Meeting>(`/api/meetings/${meetingId}`),

  join: (
    meetingId: string,
    body: { name: string; host_token?: string }
  ) =>
    http<JoinResponse>(`/api/meetings/${meetingId}/join`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  upcoming: () => http<Meeting[]>("/api/meetings/upcoming"),
  recent: () => http<Meeting[]>("/api/meetings/recent"),
  chatHistory: (meetingId: string) =>
    http<ChatMessage[]>(`/api/meetings/${meetingId}/chat`),
};

export const API_BASE = API;
export const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL || API.replace(/^http/, "ws");
