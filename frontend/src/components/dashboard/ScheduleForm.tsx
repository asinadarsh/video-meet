"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { storage } from "@/lib/storage";
import type { MeetingCreated } from "@/lib/types";

export function ScheduleForm({
  defaultName,
  onCreated,
}: {
  defaultName: string;
  onCreated: (m: MeetingCreated) => void;
}) {
  const [title, setTitle] = useState("Team sync");
  const [description, setDescription] = useState("");
  const [host_name, setHostName] = useState(defaultName);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    return d.toISOString().slice(0, 16); // local datetime-local format
  });
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const dt = new Date(date);
      const m = await api.schedule({
        title,
        description: description || undefined,
        host_name,
        scheduled_for: dt.toISOString(),
        duration_minutes: duration,
      });
      storage.setName(host_name);
      storage.setHostToken(m.meeting_id, m.host_token);
      onCreated(m);
    } catch (err: any) {
      setError(err?.message || "Failed to schedule");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field label="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-md bg-[var(--surface-2)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Your name">
          <Input value={host_name} onChange={(e) => setHostName(e.target.value)} required />
        </Field>
        <Field label="Duration (minutes)">
          <Input type="number" min={5} max={1440} value={duration} onChange={(e) => setDuration(parseInt(e.target.value || "60", 10))} />
        </Field>
      </div>
      <Field label="Date & time">
        <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={loading}>Schedule</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-[var(--muted)] mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-10 px-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] ${props.className || ""}`}
    />
  );
}
