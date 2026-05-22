"use client";

const NAME_KEY = "zc.name";
const HOST_PREFIX = "zc.host.";

export const storage = {
  getName(): string {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(NAME_KEY) || "";
  },
  setName(name: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem(NAME_KEY, name.trim());
  },
  getHostToken(meetingId: string): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(HOST_PREFIX + meetingId);
  },
  setHostToken(meetingId: string, token: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem(HOST_PREFIX + meetingId, token);
  },
};
