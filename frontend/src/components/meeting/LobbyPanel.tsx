"use client";

import { Check, X } from "lucide-react";
import { avatarColor, initials } from "@/lib/utils";

export type LobbyEntry = {
  participant_id: string;
  name: string;
  joined_at?: string | null;
};

export function LobbyPanel({
  entries,
  onAdmit,
  onDeny,
  onAdmitAll,
}: {
  entries: LobbyEntry[];
  onAdmit: (id: string) => void;
  onDeny: (id: string) => void;
  onAdmitAll: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="border-b border-[var(--border)] bg-amber-500/10">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-amber-300">
          {entries.length === 1 ? "1 person is" : `${entries.length} people are`} waiting to join
        </div>
        <button
          onClick={onAdmitAll}
          className="text-xs px-2 h-7 rounded-md bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white"
        >
          Admit all
        </button>
      </div>
      <ul className="px-2 pb-2 space-y-1">
        {entries.map((e) => (
          <li key={e.participant_id} className="flex items-center gap-3 px-2 py-2 rounded-md bg-[var(--surface)] border border-[var(--border)]">
            <div className={`size-8 rounded-full text-xs font-semibold grid place-items-center text-white ${avatarColor(e.name)}`}>
              {initials(e.name)}
            </div>
            <div className="flex-1 text-sm truncate">{e.name}</div>
            <button
              onClick={() => onDeny(e.participant_id)}
              className="inline-flex items-center gap-1 px-2 h-7 rounded text-xs border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--muted)]"
              title="Deny"
            >
              <X className="size-3.5" /> Deny
            </button>
            <button
              onClick={() => onAdmit(e.participant_id)}
              className="inline-flex items-center gap-1 px-2 h-7 rounded text-xs bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white"
              title="Admit"
            >
              <Check className="size-3.5" /> Admit
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
