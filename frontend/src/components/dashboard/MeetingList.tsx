"use client";

import { format } from "date-fns";
import { Clock, Users, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Meeting } from "@/lib/types";

export function MeetingList({
  meetings,
  empty,
  showRunning,
}: {
  meetings: Meeting[];
  empty: string;
  showRunning?: boolean;
}) {
  if (meetings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--muted)]">
        {empty}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {meetings.map((m) => (
        <MeetingRow key={m.meeting_id} meeting={m} showRunning={showRunning} />
      ))}
    </ul>
  );
}

function MeetingRow({ meeting, showRunning }: { meeting: Meeting; showRunning?: boolean }) {
  const [copied, setCopied] = useState(false);
  const when = meeting.scheduled_for
    ? format(new Date(meeting.scheduled_for), "MMM d, yyyy 'at' h:mm a")
    : meeting.started_at
      ? format(new Date(meeting.started_at), "MMM d, yyyy 'at' h:mm a")
      : "—";

  const copyLink = async () => {
    const url = meeting.invite_url || `${window.location.origin}/meeting/${meeting.meeting_id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)]/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium truncate">{meeting.title}</h3>
          {showRunning && meeting.status === "active" && (
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
              <span className="size-1.5 rounded-full bg-green-400 animate-pulse" /> Live
            </span>
          )}
          {meeting.status === "ended" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--muted)]">Ended</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" />{when}</span>
          <span>·</span>
          <span className="font-mono text-xs">{meeting.meeting_id}</span>
          {typeof meeting.participant_count === "number" && meeting.participant_count > 0 && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />{meeting.participant_count}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm border border-[var(--border)] hover:bg-[var(--surface-2)]"
        >
          <Copy className="size-3.5" />
          {copied ? "Copied" : "Copy link"}
        </button>
        <Link
          href={`/meeting/${meeting.meeting_id}`}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white"
        >
          <ExternalLink className="size-3.5" />
          {meeting.status === "ended" ? "View" : "Join"}
        </Link>
      </div>
    </li>
  );
}
