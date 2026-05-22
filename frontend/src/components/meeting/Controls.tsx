"use client";

import {
  Mic, MicOff, Video as VideoIcon, VideoOff,
  MonitorUp, MonitorOff, MessageSquare, Users,
  Hand, Smile, PhoneOff, ShieldCheck,
  Disc, Captions, MoreHorizontal, Lock, Unlock, DoorOpen, DoorClosed,
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
  // bonus features
  recording: boolean;
  recordingDisabled?: boolean;
  captionsOn: boolean;
  captionsSupported: boolean;
  lobbyEnabled: boolean;
  locked: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreen: () => void;
  onToggleChat: () => void;
  onTogglePeople: () => void;
  onToggleHand: () => void;
  onReact: (emoji: string) => void;
  onMuteAll: () => void;
  onLeave: () => void;
  onToggleRecord: () => void;
  onToggleCaptions: () => void;
  onToggleLobby: () => void;
  onToggleLock: () => void;
  onEndMeeting: () => void;
  leaveLabel?: string;
};

const REACTIONS = ["👍", "👏", "🎉", "❤️", "😂", "😮"];

export function Controls(p: Props) {
  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-3 bg-[var(--surface)] border-t border-[var(--border)] overflow-x-auto">
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
        active={p.captionsOn}
        label={p.captionsSupported ? "CC" : "CC (no)"}
        onClick={p.onToggleCaptions}
        disabled={!p.captionsSupported}
        icon={<Captions className="size-5" />}
      />

      <CtlButton
        active={p.recording}
        label={p.recording ? "Stop rec" : "Record"}
        onClick={p.onToggleRecord}
        disabled={p.recordingDisabled}
        icon={
          <Disc className={cn("size-5", p.recording && "text-red-400 animate-pulse")} />
        }
      />

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
        <HostMenu
          lobbyEnabled={p.lobbyEnabled}
          locked={p.locked}
          onMuteAll={p.onMuteAll}
          onToggleLobby={p.onToggleLobby}
          onToggleLock={p.onToggleLock}
        />
      )}

      <button
        onClick={p.onLeave}
        className="ml-1 inline-flex items-center gap-2 h-11 px-3 sm:px-5 rounded-full bg-[var(--danger)] hover:bg-red-600 text-white font-medium"
      >
        <PhoneOff className="size-4" />
        <span className="hidden sm:inline">{p.leaveLabel || "Leave"}</span>
      </button>
    </div>
  );
}

function CtlButton({
  active, danger, label, icon, onClick, badge, count, disabled,
}: {
  active?: boolean;
  danger?: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  badge?: number;
  count?: number;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative inline-flex flex-col items-center justify-center w-12 h-11 sm:w-14 sm:h-12 rounded-lg transition-colors flex-shrink-0",
        active ? "bg-[var(--surface-2)] text-white" : "text-white/90 hover:bg-[var(--surface-2)]",
        danger && "text-red-400",
        disabled && "opacity-40 cursor-not-allowed",
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
    <div className="relative group flex-shrink-0">
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

function HostMenu({
  lobbyEnabled, locked, onMuteAll, onToggleLobby, onToggleLock,
}: {
  lobbyEnabled: boolean;
  locked: boolean;
  onMuteAll: () => void;
  onToggleLobby: () => void;
  onToggleLock: () => void;
}) {
  return (
    <div className="relative group flex-shrink-0">
      <button
        className="inline-flex flex-col items-center justify-center w-12 h-11 sm:w-14 sm:h-12 rounded-lg text-white/90 hover:bg-[var(--surface-2)]"
        aria-label="Host menu"
        title="Host controls"
      >
        <MoreHorizontal className="size-5" />
        <span className="hidden sm:block text-[10px] mt-0.5">Host</span>
      </button>
      <div className="absolute bottom-full mb-2 right-0 sm:left-1/2 sm:-translate-x-1/2 hidden group-hover:block bg-[var(--surface)] border border-[var(--border)] rounded-xl py-1 shadow-xl min-w-[200px]">
        <MenuItem icon={<ShieldCheck className="size-4" />} label="Mute everyone" onClick={onMuteAll} />
        <MenuItem
          icon={lobbyEnabled ? <DoorClosed className="size-4 text-amber-400" /> : <DoorOpen className="size-4" />}
          label={lobbyEnabled ? "Disable waiting room" : "Enable waiting room"}
          onClick={onToggleLobby}
        />
        <MenuItem
          icon={locked ? <Lock className="size-4 text-amber-400" /> : <Unlock className="size-4" />}
          label={locked ? "Unlock meeting" : "Lock meeting"}
          onClick={onToggleLock}
        />
      </div>
    </div>
  );
}

function MenuItem({
  icon, label, onClick, danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--surface-2)]",
        danger && "text-red-400",
      )}
    >
      {icon} {label}
    </button>
  );
}
