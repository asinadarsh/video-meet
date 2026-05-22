"use client";

import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function Lobby({
  meetingTitle,
  onCancel,
}: {
  meetingTitle: string;
  onCancel: () => void;
}) {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center">
        <div className="size-14 mx-auto rounded-full bg-[var(--surface-2)] grid place-items-center mb-4">
          <Loader2 className="size-6 text-[var(--primary)] animate-spin" />
        </div>
        <h1 className="text-xl font-semibold mb-1">Waiting for the host to let you in</h1>
        <p className="text-sm text-[var(--muted)]">{meetingTitle}</p>
        <p className="text-xs text-[var(--muted)] mt-6">
          You'll join the meeting automatically once the host admits you.
        </p>
        <div className="mt-6">
          <Button variant="ghost" onClick={onCancel} className="text-[var(--muted)]">
            <X className="size-4" /> Leave waiting room
          </Button>
        </div>
      </div>
    </div>
  );
}
