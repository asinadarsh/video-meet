"use client";

import { Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, Hand, MoreVertical, X } from "lucide-react";
import { avatarColor, initials } from "@/lib/utils";

export type ParticipantRow = {
  participant_id: string;
  name: string;
  is_host: boolean;
  isSelf: boolean;
  audio: boolean;
  video: boolean;
  screen?: boolean;
  raisedHand?: boolean;
};

export function ParticipantsPanel({
  rows,
  isHost,
  onClose,
  onMute,
  onRemove,
}: {
  rows: ParticipantRow[];
  isHost: boolean;
  onClose: () => void;
  onMute: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full bg-[var(--surface)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h3 className="font-semibold text-sm">Participants ({rows.length})</h3>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-white p-1"><X className="size-4" /></button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {rows.map((r) => (
          <li
            key={r.participant_id}
            className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-[var(--surface-2)]"
          >
            <div className={`size-8 rounded-full grid place-items-center text-xs font-semibold text-white ${avatarColor(r.name)}`}>
              {initials(r.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {r.name}
                {r.isSelf ? " (You)" : ""}
                {r.is_host && <span className="ml-2 text-xs text-[var(--primary)]">Host</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 text-[var(--muted)]">
              {r.raisedHand && <Hand className="size-4 text-amber-400" />}
              {r.screen && <MonitorUp className="size-4 text-green-400" />}
              {r.audio ? <Mic className="size-4" /> : <MicOff className="size-4 text-red-400" />}
              {r.video ? <VideoIcon className="size-4" /> : <VideoOff className="size-4 text-red-400" />}
              {isHost && !r.isSelf && (
                <div className="relative group">
                  <button className="p-1 rounded hover:bg-[var(--border)]"><MoreVertical className="size-4" /></button>
                  <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-[var(--surface)] border border-[var(--border)] rounded-md shadow-xl py-1 z-10 min-w-[140px]">
                    <button
                      onClick={() => onMute(r.participant_id)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface-2)]"
                    >Mute</button>
                    <button
                      onClick={() => onRemove(r.participant_id)}
                      className="w-full text-left px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[var(--surface-2)]"
                    >Remove</button>
                  </div>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
