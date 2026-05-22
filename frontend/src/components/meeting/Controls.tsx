"use client";

import {
  Mic, MicOff, Video as VideoIcon, VideoOff,
  MonitorUp, MonitorOff, MessageSquare, Users,
  Hand, Smile, PhoneOff, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  audioOn: boolean;
  videoOn: boolean;
  screenOn: boolean;
  chatOpen: boolean;
  peopleOpen: boolean;
  handRaised: boolean;
  isHost: boolean;
  unread: number;
  participantCount: number;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreen: () => void;
  onToggleChat: () => void;
  onTogglePeople: () => void;
  onToggleHand: () => void;
  onReact: (emoji: string) => void;
  onMuteAll: () => void;
  onLeave: () => void;
};

const REACTIONS = ["👍", "👏", "🎉", "❤️", "😂", "😮"];

export function Controls(p: Props) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 px-3 py-3 bg-[var(--surface)] border-t border-[var(--border)]">
      <CtlButton
        active={p.audioOn}
        label={p.audioOn ? "Mute" : "Unmute"}
        onClick={p.onToggleAudio}
        danger={!p.audioOn}
        icon={p.audioOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      />
      <CtlButton
        active={p.videoOn}
        label={p.videoOn ? "Stop video" : "Start video"}
        onClick={p.onToggleVideo}
        danger={!p.videoOn}
        icon={p.videoOn ? <VideoIcon className="size-5" /> : <VideoOff className="size-5" />}
      />
      <CtlButton
        active={p.screenOn}
        label={p.screenOn ? "Stop share" : "Share"}
        onClick={p.onToggleScreen}
        icon={p.screenOn ? <MonitorOff className="size-5" /> : <MonitorUp className="size-5" />}
      />

      <CtlButton
        active={p.handRaised}
        label="Raise"
        onClick={p.onToggleHand}
        icon={<Hand className="size-5" />}
      />

      <ReactionMenu onReact={p.onReact} />

      <CtlButton
        active={p.chatOpen}
        label="Chat"
        onClick={p.onToggleChat}
        badge={p.unread}
        icon={<MessageSquare className="size-5" />}
      />
      <CtlButton
        active={p.peopleOpen}
        label="People"
        onClick={p.onTogglePeople}
        count={p.participantCount}
        icon={<Users className="size-5" />}
      />

      {p.isHost && (
        <CtlButton
          label="Mute all"
          onClick={p.onMuteAll}
          icon={<ShieldCheck className="size-5" />}
        />
      )}

      <button
        onClick={p.onLeave}
        className="ml-2 inline-flex items-center gap-2 h-11 px-4 sm:px-5 rounded-full bg-[var(--danger)] hover:bg-red-600 text-white font-medium"
      >
        <PhoneOff className="size-4" />
        <span className="hidden sm:inline">Leave</span>
      </button>
    </div>
  );
}

function CtlButton({
  active, danger, label, icon, onClick, badge, count,
}: {
  active?: boolean;
  danger?: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  badge?: number;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative inline-flex flex-col items-center justify-center w-12 h-11 sm:w-14 sm:h-12 rounded-lg transition-colors",
        active ? "bg-[var(--surface-2)] text-white" : "text-white/90 hover:bg-[var(--surface-2)]",
        danger && "text-red-400",
      )}
      aria-label={label}
      title={label}
    >
      {icon}
      <span className="hidden sm:block text-[10px] mt-0.5">{label}</span>
      {!!badge && (
        <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full text-[10px] bg-[var(--primary)] text-white grid place-items-center">{badge}</span>
      )}
      {typeof count === "number" && count > 0 && (
        <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full text-[10px] bg-[var(--surface)] border border-[var(--border)] grid place-items-center">{count}</span>
      )}
    </button>
  );
}

function ReactionMenu({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="relative group">
      <button
        className="inline-flex flex-col items-center justify-center w-12 h-11 sm:w-14 sm:h-12 rounded-lg text-white/90 hover:bg-[var(--surface-2)]"
        aria-label="React"
        title="React"
      >
        <Smile className="size-5" />
        <span className="hidden sm:block text-[10px] mt-0.5">React</span>
      </button>
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2 gap-1 shadow-xl">
        {REACTIONS.map((e) => (
          <button
            key={e}
            onClick={() => onReact(e)}
            className="size-9 rounded-md hover:bg-[var(--surface-2)] text-xl"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
