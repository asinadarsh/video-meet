"use client";

import { Video, Plus, Calendar, LinkIcon } from "lucide-react";

export type Action = "new" | "join" | "schedule" | "link";

const cards: { id: Action; title: string; subtitle: string; icon: any; accent: string }[] = [
  { id: "new", title: "New Meeting", subtitle: "Start an instant meeting", icon: Video, accent: "bg-[var(--primary)]" },
  { id: "join", title: "Join", subtitle: "with a meeting ID", icon: Plus, accent: "bg-blue-500" },
  { id: "schedule", title: "Schedule", subtitle: "for a future date", icon: Calendar, accent: "bg-violet-500" },
  { id: "link", title: "Share Screen", subtitle: "in an active meeting", icon: LinkIcon, accent: "bg-amber-500" },
];

export function ActionCards({ onAction }: { onAction: (id: Action) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <button
            key={c.id}
            onClick={() => onAction(c.id)}
            className="group flex flex-col items-start gap-4 p-5 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] transition-all text-left"
          >
            <div className={`size-12 rounded-xl grid place-items-center ${c.accent} text-white shadow-lg group-hover:scale-105 transition-transform`}>
              <Icon className="size-6" />
            </div>
            <div>
              <div className="font-semibold">{c.title}</div>
              <div className="text-sm text-[var(--muted)]">{c.subtitle}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
