"use client";

import { format } from "date-fns";
import { Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { avatarColor, initials } from "@/lib/utils";

export function ChatPanel({
  messages,
  selfId,
  onSend,
  onClose,
  typingNames,
  onTyping,
}: {
  messages: ChatMessage[];
  selfId: string | null;
  onSend: (text: string) => void;
  onClose: () => void;
  typingNames: string[];
  onTyping: (v: boolean) => void;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
    onTyping(false);
  };

  const onChange = (v: string) => {
    setText(v);
    onTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 1500);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h3 className="font-semibold text-sm">Chat</h3>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-white p-1"><X className="size-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--muted)] text-center py-12">No messages yet. Say hello.</p>
        )}
        {messages.map((m) => {
          const mine = m.participant_id === selfId;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : ""}`}>
              {!mine && (
                <div className={`size-7 shrink-0 rounded-full text-xs font-semibold grid place-items-center text-white ${avatarColor(m.sender_name)}`}>
                  {initials(m.sender_name)}
                </div>
              )}
              <div className={`max-w-[80%] ${mine ? "items-end" : ""} flex flex-col`}>
                <div className="text-[11px] text-[var(--muted)] mb-0.5">
                  {mine ? "You" : m.sender_name} · {format(new Date(m.created_at), "h:mm a")}
                </div>
                <div
                  className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    mine
                      ? "bg-[var(--primary)] text-white rounded-br-sm"
                      : "bg-[var(--surface-2)] text-[var(--foreground)] rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {typingNames.length > 0 && (
        <div className="px-4 py-1 text-xs text-[var(--muted)]">
          {typingNames.slice(0, 2).join(", ")}{typingNames.length > 2 ? " and others" : ""} typing…
        </div>
      )}

      <form onSubmit={submit} className="border-t border-[var(--border)] p-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a message"
          className="flex-1 h-10 px-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="h-10 w-10 rounded-md bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white disabled:opacity-50 grid place-items-center"
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
