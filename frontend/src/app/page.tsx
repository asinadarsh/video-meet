"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Video } from "lucide-react";
import { ActionCards, Action } from "@/components/dashboard/ActionCards";
import { MeetingList } from "@/components/dashboard/MeetingList";
import { ScheduleForm } from "@/components/dashboard/ScheduleForm";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { storage } from "@/lib/storage";
import type { Meeting, MeetingCreated } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [upcoming, setUpcoming] = useState<Meeting[]>([]);
  const [recent, setRecent] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [open, setOpen] = useState<Action | null>(null);
  const [joinId, setJoinId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(storage.getName());
    refresh();
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([api.upcoming(), api.recent()]);
      setUpcoming(u);
      setRecent(r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (id: Action) => {
    setError(null);
    setOpen(id);
  };

  const startInstant = async () => {
    const who = (name || "").trim();
    if (!who) {
      setError("Enter your name first");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const m = await api.createInstant({ host_name: who, title: `${who}'s Meeting` });
      storage.setName(who);
      storage.setHostToken(m.meeting_id, m.host_token);
      router.push(`/meeting/${m.meeting_id}`);
    } catch (e: any) {
      setError(e?.message || "Could not create meeting");
    } finally {
      setPending(false);
    }
  };

  const joinById = async () => {
    const id = joinId.trim();
    if (!id) {
      setError("Enter a meeting ID");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.get(id);
      if (name.trim()) storage.setName(name.trim());
      router.push(`/meeting/${id}`);
    } catch (e: any) {
      setError(e?.message?.includes("404") ? "Meeting not found" : e?.message);
    } finally {
      setPending(false);
    }
  };

  const onScheduled = (m: MeetingCreated) => {
    setOpen(null);
    refresh();
    router.push(`/meeting/${m.meeting_id}`);
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-lg bg-[var(--primary)] grid place-items-center">
              <Video className="size-5 text-white" />
            </div>
            <span className="text-lg font-semibold">Zoom Clone</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => storage.setName(name.trim())}
              className="h-9 px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Welcome{name ? `, ${name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-[var(--muted)]">Host a meeting, join one, or schedule for later.</p>
          </div>
          <ActionCards onAction={handleAction} />
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
              Upcoming meetings
            </h2>
            <MeetingList meetings={upcoming} empty={loading ? "Loading…" : "No upcoming meetings yet."} />
          </section>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
              Recent meetings
            </h2>
            <MeetingList meetings={recent} empty={loading ? "Loading…" : "No recent meetings yet."} showRunning />
          </section>
        </div>
      </section>

      <Modal open={open === "new"} onClose={() => setOpen(null)} title="Start an instant meeting">
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">A new meeting will start and you'll be the host.</p>
          <label className="block">
            <span className="block text-sm text-[var(--muted)] mb-1.5">Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
            />
          </label>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
            <Button onClick={startInstant} loading={pending}>Start meeting</Button>
          </div>
        </div>
      </Modal>

      <Modal open={open === "join"} onClose={() => setOpen(null)} title="Join a meeting">
        <div className="space-y-4">
          <label className="block">
            <span className="block text-sm text-[var(--muted)] mb-1.5">Meeting ID</span>
            <input
              type="text"
              placeholder="xxx-xxxx-xxx"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)] font-mono focus:outline-none focus:border-[var(--primary)]"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-[var(--muted)] mb-1.5">Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
            />
          </label>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
            <Button onClick={joinById} loading={pending}>Join</Button>
          </div>
        </div>
      </Modal>

      <Modal open={open === "schedule"} onClose={() => setOpen(null)} title="Schedule a meeting" size="lg">
        <ScheduleForm defaultName={name} onCreated={onScheduled} />
      </Modal>

      <Modal open={open === "link"} onClose={() => setOpen(null)} title="Share Screen">
        <p className="text-sm text-[var(--muted)]">
          Open or join a meeting first, then use the Share Screen control in the meeting room.
        </p>
        <div className="flex justify-end pt-4">
          <Button onClick={() => setOpen(null)}>Got it</Button>
        </div>
      </Modal>
    </main>
  );
}
