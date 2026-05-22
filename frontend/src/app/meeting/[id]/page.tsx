"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Copy, Info, LayoutGrid, User, Lock, DoorClosed, PhoneOff, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { storage } from "@/lib/storage";
import type { ChatMessage, JoinResponse, Meeting, Participant } from "@/lib/types";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PreJoin } from "@/components/meeting/PreJoin";
import { Lobby } from "@/components/meeting/Lobby";
import { LobbyPanel, type LobbyEntry } from "@/components/meeting/LobbyPanel";
import { CaptionsOverlay, type CaptionLine } from "@/components/meeting/CaptionsOverlay";
import { VideoGrid, type TileData, type ViewMode } from "@/components/meeting/VideoGrid";
import { Controls } from "@/components/meeting/Controls";
import { ChatPanel } from "@/components/meeting/ChatPanel";
import {
  ParticipantsPanel,
  type ParticipantRow,
} from "@/components/meeting/ParticipantsPanel";
import { useSocket } from "@/hooks/useSocket";
import { useWebRTC, type RemotePeer } from "@/hooks/useWebRTC";
import { useRecorder } from "@/hooks/useRecorder";
import { useActiveSpeaker } from "@/hooks/useActiveSpeaker";
import { useConnectionQuality } from "@/hooks/useConnectionQuality";
import { useCaptions } from "@/hooks/useCaptions";

type Stage = "loading" | "prejoin" | "joining" | "waiting" | "in-meeting" | "left" | "error";

export default function MeetingRoomPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);

  const [joinInfo, setJoinInfo] = useState<JoinResponse | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const originalCamTrackRef = useRef<MediaStreamTrack | null>(null);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [typing, setTyping] = useState<Map<string, string>>(new Map());
  const [floating, setFloating] = useState<{ id: number; from: string; emoji: string }[]>([]);
  const [handRaised, setHandRaised] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [userOverrodeView, setUserOverrodeView] = useState(false);

  // bonus features
  const [lobbyEnabled, setLobbyEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lobbyEntries, setLobbyEntries] = useState<LobbyEntry[]>([]);
  const [levels, setLevels] = useState<Map<string, number>>(new Map());
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captionLines, setCaptionLines] = useState<CaptionLine[]>([]);
  const captionSeqRef = useRef(0);

  const selfId = joinInfo?.participant_id ?? null;
  const isHost = !!joinInfo?.is_host;

  // sendSignal stable wrapper
  type Outgoing = Record<string, unknown>;
  const sendRef = useRef<(msg: Outgoing) => void>(() => {});
  const sendSignal = useCallback((target: string, payload: unknown) => {
    sendRef.current({ type: "signal", target, payload });
  }, []);

  const rtc = useWebRTC({ selfId, localStream, sendSignal });

  // refs to dodge stale closures
  const participantsRef = useRef<Participant[]>([]);
  participantsRef.current = participants;
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const toggleAudioRef = useRef<(force?: boolean) => void>(() => {});

  // ---- handle incoming socket messages ----
  const onSocketMessage = useCallback(
    (msg: Record<string, unknown>) => {
      if (!msg || !msg.type) return;
      switch (msg.type as string) {
        case "init": {
          const others = (msg.participants as Participant[]).filter(
            (p) => p.participant_id !== (msg.self_id as string),
          );
          setParticipants((cur) => {
            const known = new Set(cur.map((p) => p.participant_id));
            return [...cur, ...others.filter((p) => !known.has(p.participant_id))];
          });
          if (typeof msg.lobby_enabled === "boolean") setLobbyEnabled(msg.lobby_enabled);
          if (typeof msg.locked === "boolean") setLocked(msg.locked);
          if (Array.isArray(msg.waiting)) {
            setLobbyEntries(msg.waiting as LobbyEntry[]);
          }
          if (!msg.in_lobby) {
            for (const p of others) {
              rtc.initiateOffer(p.participant_id, p.name);
            }
          }
          break;
        }
        case "admitted": {
          setStage("in-meeting");
          break;
        }
        case "lobby-knock": {
          const p = msg.participant as LobbyEntry;
          setLobbyEntries((cur) =>
            cur.some((x) => x.participant_id === p.participant_id) ? cur : [...cur, p],
          );
          break;
        }
        case "lobby-leave": {
          const id = msg.participant_id as string;
          setLobbyEntries((cur) => cur.filter((x) => x.participant_id !== id));
          break;
        }
        case "meeting-state": {
          if (typeof msg.lobby_enabled === "boolean") setLobbyEnabled(msg.lobby_enabled);
          if (typeof msg.locked === "boolean") setLocked(msg.locked);
          break;
        }
        case "participant-joined": {
          const p = msg.participant as Participant;
          if (!p || p.participant_id === selfId) break;
          setParticipants((cur) =>
            cur.some((x) => x.participant_id === p.participant_id) ? cur : [...cur, p],
          );
          break;
        }
        case "participant-left": {
          const id = msg.participant_id as string;
          setParticipants((cur) => cur.filter((p) => p.participant_id !== id));
          rtc.closePeer(id);
          setTyping((cur) => {
            const next = new Map(cur);
            next.delete(id);
            return next;
          });
          setLevels((cur) => {
            const next = new Map(cur);
            next.delete(id);
            return next;
          });
          break;
        }
        case "signal": {
          const from = msg.from as string;
          const fromName =
            participantsRef.current.find((p) => p.participant_id === from)?.name || "Peer";
          rtc.handleSignal(from, fromName, msg.payload as never);
          break;
        }
        case "state": {
          rtc.updatePeer(msg.from as string, {
            audio: !!msg.audio,
            video: !!msg.video,
            screen: !!msg.screen,
          });
          break;
        }
        case "raise-hand": {
          rtc.updatePeer(msg.from as string, { raisedHand: !!msg.value });
          break;
        }
        case "reaction": {
          const id = Date.now() + Math.random();
          setFloating((cur) => [...cur, { id, from: msg.from as string, emoji: msg.emoji as string }]);
          setTimeout(() => setFloating((cur) => cur.filter((f) => f.id !== id)), 3000);
          break;
        }
        case "typing": {
          const id = msg.from as string;
          const name =
            participantsRef.current.find((p) => p.participant_id === id)?.name || "Someone";
          setTyping((cur) => {
            const next = new Map(cur);
            if (msg.value) next.set(id, name);
            else next.delete(id);
            return next;
          });
          break;
        }
        case "chat": {
          const m = msg.message as ChatMessage;
          setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
          if (!chatOpenRef.current && m.participant_id !== selfId) {
            setUnread((u) => u + 1);
          }
          break;
        }
        case "level": {
          const id = msg.from as string;
          const value = typeof msg.value === "number" ? msg.value : 0;
          setLevels((cur) => {
            const next = new Map(cur);
            if (value <= 0.05) next.delete(id);
            else next.set(id, value);
            return next;
          });
          break;
        }
        case "caption": {
          const line: CaptionLine = {
            id: ++captionSeqRef.current,
            from: msg.from as string,
            name: (msg.name as string) || "Someone",
            text: (msg.text as string) || "",
            ts: Date.now(),
          };
          setCaptionLines((cur) => [...cur, line].slice(-12));
          break;
        }
        case "force-mute": {
          if (!msg.target || msg.target === selfId) {
            toggleAudioRef.current(false);
          }
          break;
        }
        case "removed":
        case "ended": {
          setStage("left");
          break;
        }
      }
    },
    [rtc, selfId],
  );

  // ---- socket ----
  // Connect during both waiting and in-meeting (we need it to receive 'admitted')
  const socketActive = stage === "in-meeting" || stage === "waiting";
  const { state: socketState, send } = useSocket(
    socketActive ? meetingId : null,
    selfId,
    onSocketMessage,
  );
  sendRef.current = send;

  // ---- fetch meeting ----
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await api.get(meetingId);
        if (!alive) return;
        setMeeting(m);
        setLobbyEnabled(!!m.lobby_enabled);
        setLocked(!!m.locked);
        setStage("prejoin");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load meeting";
        setErrorMsg(msg.includes("404") ? "Meeting not found" : msg);
        setStage("error");
      }
    })();
    return () => { alive = false; };
  }, [meetingId]);

  // ---- join ----
  const handlePreJoinSubmit = async ({
    name, audio, video,
  }: { name: string; audio: boolean; video: boolean }) => {
    setStage("joining");
    try {
      const hostToken = storage.getHostToken(meetingId) || undefined;
      const j = await api.join(meetingId, { name, host_token: hostToken });
      storage.setName(name);
      setJoinInfo(j);
      setMeeting(j.meeting);
      setLobbyEnabled(!!j.meeting.lobby_enabled);
      setLocked(!!j.meeting.locked);
      setParticipants(j.participants.filter((p) => p.participant_id !== j.participant_id));
      setAudioOn(audio);
      setVideoOn(video);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      stream.getAudioTracks().forEach((t) => (t.enabled = audio));
      stream.getVideoTracks().forEach((t) => (t.enabled = video));
      setLocalStream(stream);

      try {
        const history = await api.chatHistory(meetingId);
        setMessages(history);
      } catch {}

      // If lobby is on and we're not host, we land in the waiting room.
      // The socket connects, the server sends in_lobby:true via 'init',
      // and we wait for the 'admitted' message.
      setStage(j.status === "waiting" ? "waiting" : "in-meeting");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not join meeting";
      setErrorMsg(msg);
      setStage("error");
    }
  };

  // ---- broadcast local state ----
  useEffect(() => {
    if (stage !== "in-meeting") return;
    sendRef.current({ type: "state", audio: audioOn, video: videoOn, screen: screenOn });
  }, [audioOn, videoOn, screenOn, stage]);

  // ---- controls ----
  const toggleAudio = useCallback((force?: boolean) => {
    setAudioOn((cur) => {
      const next = typeof force === "boolean" ? force : !cur;
      localStream?.getAudioTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, [localStream]);
  toggleAudioRef.current = toggleAudio;

  const toggleVideo = useCallback(() => {
    setVideoOn((cur) => {
      const next = !cur;
      localStream?.getVideoTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, [localStream]);

  const toggleScreenShare = useCallback(async () => {
    if (!localStream) return;
    if (screenOn) {
      screenTrackRef.current?.stop();
      const cam = originalCamTrackRef.current;
      if (cam) {
        localStream.removeTrack(localStream.getVideoTracks()[0]);
        localStream.addTrack(cam);
        await rtc.replaceVideoTrack(cam);
      }
      screenTrackRef.current = null;
      originalCamTrackRef.current = null;
      setScreenOn(false);
    } else {
      try {
        const ds = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const track: MediaStreamTrack = ds.getVideoTracks()[0];
        track.onended = () => { toggleScreenShare(); };
        const camTrack = localStream.getVideoTracks()[0];
        originalCamTrackRef.current = camTrack;
        if (camTrack) localStream.removeTrack(camTrack);
        localStream.addTrack(track);
        screenTrackRef.current = track;
        await rtc.replaceVideoTrack(track);
        setScreenOn(true);
      } catch (e) {
        console.warn("Screen share cancelled", e);
      }
    }
  }, [localStream, rtc, screenOn]);

  const toggleHand = useCallback(() => {
    setHandRaised((v) => {
      const next = !v;
      sendRef.current({ type: "raise-hand", value: next });
      return next;
    });
  }, []);

  const onReact = useCallback((emoji: string) => {
    sendRef.current({ type: "reaction", emoji });
  }, []);

  const onMuteAll = useCallback(() => {
    sendRef.current({ type: "host-action", action: "mute-all" });
  }, []);

  const muteParticipant = useCallback((id: string) => {
    sendRef.current({ type: "host-action", action: "mute", target: id });
  }, []);

  const removeParticipant = useCallback((id: string) => {
    sendRef.current({ type: "host-action", action: "remove", target: id });
  }, []);

  const admitParticipant = useCallback((id: string) => {
    sendRef.current({ type: "host-action", action: "admit", target: id });
  }, []);
  const denyParticipant = useCallback((id: string) => {
    sendRef.current({ type: "host-action", action: "deny", target: id });
  }, []);
  const admitAll = useCallback(() => {
    lobbyEntries.forEach((e) => admitParticipant(e.participant_id));
  }, [lobbyEntries, admitParticipant]);

  const toggleLobby = useCallback(() => {
    sendRef.current({ type: "host-action", action: lobbyEnabled ? "disable-lobby" : "enable-lobby" });
  }, [lobbyEnabled]);
  const toggleLock = useCallback(() => {
    sendRef.current({ type: "host-action", action: locked ? "unlock" : "lock" });
  }, [locked]);
  const endMeetingForAll = useCallback(() => {
    sendRef.current({ type: "host-action", action: "end" });
    setLeaveDialogOpen(false);
  }, []);

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const onLeaveClick = useCallback(() => {
    if (isHost) {
      setLeaveDialogOpen(true);
    } else {
      setStage("left");
    }
  }, [isHost]);
  const leaveJustMe = useCallback(() => {
    setLeaveDialogOpen(false);
    setStage("left");
  }, []);

  // ---- recorder ----
  const recorderFilename = useMemo(
    () => `meeting-${meetingId}`,
    [meetingId],
  );
  const recorder = useRecorder(localStream, recorderFilename);
  const onToggleRecord = useCallback(() => {
    if (recorder.state === "recording") recorder.stop();
    else recorder.start();
  }, [recorder]);

  // ---- captions (own mic) ----
  const sendCaption = useCallback((text: string, final: boolean) => {
    sendRef.current({ type: "caption", text, final });
  }, []);
  const captions = useCaptions({
    enabled: captionsOn,
    audioEnabled: audioOn,
    onText: (text, final) => { if (final) sendCaption(text, true); },
  });

  // ---- active speaker (broadcast own mic level) ----
  useActiveSpeaker(localStream, audioOn, (value) => {
    sendRef.current({ type: "level", value });
    if (selfId) {
      setLevels((cur) => {
        const next = new Map(cur);
        if (value <= 0.05) next.delete(selfId);
        else next.set(selfId, value);
        return next;
      });
    }
  });

  // ---- connection quality ----
  const qualities = useConnectionQuality(rtc.peerConnections.current);

  // ---- cleanup ----
  useEffect(() => {
    if (stage === "left") {
      localStream?.getTracks().forEach((t) => t.stop());
      screenTrackRef.current?.stop();
      originalCamTrackRef.current = null;
    }
  }, [stage, localStream]);

  // ---- chat helpers ----
  const sendChat = (text: string) => sendRef.current({ type: "chat", content: text });
  const sendTyping = (v: boolean) => sendRef.current({ type: "typing", value: v });

  // ---- copy invite ----
  const copyInvite = async () => {
    const url = meeting?.invite_url || `${window.location.origin}/meeting/${meetingId}`;
    try { await navigator.clipboard.writeText(url); } catch {}
  };

  // ---- render gates ----
  if (stage === "loading") {
    return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading meeting…</div>;
  }
  if (stage === "error") {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold mb-2">Cannot join meeting</h1>
          <p className="text-[var(--muted)] mb-4">{errorMsg}</p>
          <button onClick={() => router.push("/")} className="text-[var(--primary)] hover:underline">
            Back to home
          </button>
        </div>
      </div>
    );
  }
  if (stage === "left") {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold mb-2">You left the meeting</h1>
          <p className="text-[var(--muted)] mb-6">Hope it went well!</p>
          <button onClick={() => router.push("/")} className="px-4 h-10 rounded-md bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white">
            Back to home
          </button>
        </div>
      </div>
    );
  }
  if (stage === "prejoin" || stage === "joining") {
    return (
      <PreJoin
        meetingTitle={meeting?.title || "Joining meeting…"}
        defaultName={storage.getName()}
        onJoin={handlePreJoinSubmit}
      />
    );
  }
  if (stage === "waiting") {
    return (
      <Lobby
        meetingTitle={meeting?.title || "Meeting"}
        onCancel={() => setStage("left")}
      />
    );
  }

  // ---- in-meeting ----
  const peersArr: RemotePeer[] = Array.from(rtc.peers.values());
  const selfName = storage.getName() || "You";

  // Active speaker: highest level above a threshold; ignore screen sharer
  // (they're already on stage).
  let activeSpeakerId: string | null = null;
  let bestLevel = 0.08;
  for (const [id, lvl] of levels) {
    if (lvl > bestLevel) {
      bestLevel = lvl;
      activeSpeakerId = id;
    }
  }

  const tiles: TileData[] = [
    {
      id: selfId!,
      stream: localStream,
      name: selfName,
      audio: audioOn,
      video: videoOn,
      screen: screenOn,
      raisedHand: handRaised,
      isSelf: true,
      isHost,
      speaking: activeSpeakerId === selfId,
      // We don't measure our own connection quality from the other side;
      // leave unset.
    },
    ...peersArr.map<TileData>((p) => ({
      id: p.participant_id,
      stream: p.stream,
      name: p.name,
      audio: p.audio,
      video: p.video,
      screen: p.screen,
      raisedHand: p.raisedHand,
      isHost: participants.find((x) => x.participant_id === p.participant_id)?.is_host || false,
      quality: qualities.get(p.participant_id),
      speaking: activeSpeakerId === p.participant_id,
    })),
  ];

  const rows: ParticipantRow[] = tiles.map<ParticipantRow>((t) => ({
    participant_id: t.id,
    name: t.name,
    is_host: !!t.isHost,
    isSelf: !!t.isSelf,
    audio: t.audio,
    video: t.video,
    screen: t.screen,
    raisedHand: t.raisedHand,
  }));

  const screenSharer = tiles.find((t) => t.screen);
  // Spotlight order: pin → screen share → active speaker
  const spotlightId =
    pinnedId ??
    screenSharer?.id ??
    (activeSpeakerId && activeSpeakerId !== selfId ? activeSpeakerId : null);

  const effectiveMode: ViewMode =
    userOverrodeView ? viewMode : screenSharer ? "speaker" : viewMode;

  const togglePin = (id: string) => {
    setPinnedId((cur) => (cur === id ? null : id));
    if (!userOverrodeView) setUserOverrodeView(true);
  };

  const sideOpen = chatOpen || peopleOpen;

  return (
    <div className="h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-3 min-w-0">
          <Info className="size-4 text-[var(--muted)]" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate flex items-center gap-2">
              {meeting?.title || "Meeting"}
              {locked && <Lock className="size-3.5 text-amber-400" />}
              {lobbyEnabled && <DoorClosed className="size-3.5 text-amber-400" />}
            </div>
            <div className="text-xs text-[var(--muted)] font-mono">{meetingId}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              socketState === "open"
                ? "bg-green-500/15 text-green-400"
                : socketState === "connecting"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-red-500/15 text-red-400"
            }`}
          >
            {socketState === "open" ? "Connected" : socketState}
          </span>

          <div className="hidden sm:flex items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-0.5">
            <button
              onClick={() => { setViewMode("gallery"); setUserOverrodeView(true); }}
              className={`inline-flex items-center gap-1.5 px-2 h-7 rounded text-xs ${
                effectiveMode === "gallery" ? "bg-[var(--surface)] text-white" : "text-[var(--muted)] hover:text-white"
              }`}
              title="Gallery view"
            >
              <LayoutGrid className="size-3.5" /> Gallery
            </button>
            <button
              onClick={() => { setViewMode("speaker"); setUserOverrodeView(true); }}
              className={`inline-flex items-center gap-1.5 px-2 h-7 rounded text-xs ${
                effectiveMode === "speaker" ? "bg-[var(--surface)] text-white" : "text-[var(--muted)] hover:text-white"
              }`}
              title="Speaker view"
            >
              <User className="size-3.5" /> Speaker
            </button>
          </div>

          <button
            onClick={copyInvite}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs border border-[var(--border)] hover:bg-[var(--surface-2)]"
          >
            <Copy className="size-3.5" /> Copy invite
          </button>
        </div>
      </header>

      {isHost && lobbyEntries.length > 0 && (
        <LobbyPanel
          entries={lobbyEntries}
          onAdmit={admitParticipant}
          onDeny={denyParticipant}
          onAdmitAll={admitAll}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 p-3 sm:p-4 overflow-hidden relative">
          <VideoGrid
            mode={effectiveMode}
            tiles={tiles}
            spotlightId={spotlightId}
            pinnedId={pinnedId}
            onTogglePin={togglePin}
          />

          {captionsOn && <CaptionsOverlay lines={captionLines} />}

          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {floating.map((f) => (
              <div
                key={f.id}
                className="absolute bottom-4 left-1/2 text-4xl"
                style={{
                  animation: "floatUp 3s ease-out forwards",
                  transform: `translateX(${(Math.random() - 0.5) * 200}px)`,
                }}
              >
                {f.emoji}
              </div>
            ))}
          </div>
        </main>

        {sideOpen && (
          <aside className="w-full sm:w-80 lg:w-96 border-l border-[var(--border)] flex-shrink-0 absolute sm:static inset-0 sm:inset-auto z-20 sm:z-auto">
            {chatOpen ? (
              <ChatPanel
                messages={messages}
                selfId={selfId}
                onSend={sendChat}
                onClose={() => setChatOpen(false)}
                typingNames={Array.from(typing.values())}
                onTyping={sendTyping}
              />
            ) : (
              <ParticipantsPanel
                rows={rows}
                isHost={isHost}
                onClose={() => setPeopleOpen(false)}
                onMute={muteParticipant}
                onRemove={removeParticipant}
              />
            )}
          </aside>
        )}
      </div>

      <Controls
        audioOn={audioOn}
        videoOn={videoOn}
        screenOn={screenOn}
        chatOpen={chatOpen}
        peopleOpen={peopleOpen}
        handRaised={handRaised}
        isHost={isHost}
        unread={chatOpen ? 0 : unread}
        participantCount={rows.length}
        recording={recorder.state === "recording"}
        recordingDisabled={!localStream}
        captionsOn={captionsOn}
        captionsSupported={captions.supported}
        lobbyEnabled={lobbyEnabled}
        locked={locked}
        onToggleAudio={() => toggleAudio()}
        onToggleVideo={toggleVideo}
        onToggleScreen={toggleScreenShare}
        onToggleChat={() => {
          setPeopleOpen(false);
          setChatOpen((v) => {
            const next = !v;
            if (next) setUnread(0);
            return next;
          });
        }}
        onTogglePeople={() => {
          setChatOpen(false);
          setPeopleOpen((v) => !v);
        }}
        onToggleHand={toggleHand}
        onReact={onReact}
        onMuteAll={onMuteAll}
        onLeave={onLeaveClick}
        onToggleRecord={onToggleRecord}
        onToggleCaptions={() => setCaptionsOn((v) => !v)}
        onToggleLobby={toggleLobby}
        onToggleLock={toggleLock}
        onEndMeeting={endMeetingForAll}
        leaveLabel={isHost ? "End" : "Leave"}
      />

      <Modal
        open={leaveDialogOpen}
        onClose={() => setLeaveDialogOpen(false)}
        title="End meeting"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            As the host, you can leave the meeting and let others continue, or end the meeting for everyone.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
            <Button variant="ghost" onClick={() => setLeaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={leaveJustMe}>
              <LogOut className="size-4" /> Leave meeting
            </Button>
            <Button variant="danger" onClick={endMeetingForAll}>
              <PhoneOff className="size-4" /> End for everyone
            </Button>
          </div>
        </div>
      </Modal>

      <style jsx global>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(-60vh) scale(1.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
