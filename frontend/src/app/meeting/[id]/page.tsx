"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Copy, Info, LayoutGrid, User } from "lucide-react";
import { api } from "@/lib/api";
import { storage } from "@/lib/storage";
import type { ChatMessage, JoinResponse, Meeting, Participant } from "@/lib/types";

import { PreJoin } from "@/components/meeting/PreJoin";
import { VideoGrid, type TileData, type ViewMode } from "@/components/meeting/VideoGrid";
import { Controls } from "@/components/meeting/Controls";
import { ChatPanel } from "@/components/meeting/ChatPanel";
import {
  ParticipantsPanel,
  type ParticipantRow,
} from "@/components/meeting/ParticipantsPanel";
import { useSocket } from "@/hooks/useSocket";
import { useWebRTC, type RemotePeer } from "@/hooks/useWebRTC";

type Stage = "loading" | "prejoin" | "joining" | "in-meeting" | "left" | "error";

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

  const selfId = joinInfo?.participant_id ?? null;
  const isHost = !!joinInfo?.is_host;

  // sendSignal stable wrapper (closed over by useWebRTC)
  const sendRef = useRef<(msg: any) => void>(() => {});
  const sendSignal = useCallback((target: string, payload: any) => {
    sendRef.current({ type: "signal", target, payload });
  }, []);

  const rtc = useWebRTC({ selfId, localStream, sendSignal });

  // ---- handle incoming socket messages ----
  const onSocketMessage = useCallback(
    (msg: any) => {
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case "init": {
          const others = (msg.participants as Participant[]).filter(
            (p) => p.participant_id !== msg.self_id,
          );
          setParticipants((cur) => {
            const known = new Set(cur.map((p) => p.participant_id));
            return [...cur, ...others.filter((p) => !known.has(p.participant_id))];
          });
          // we joined last → we initiate offers to everyone already here
          for (const p of others) {
            rtc.initiateOffer(p.participant_id, p.name);
          }
          break;
        }
        case "participant-joined": {
          const p = msg.participant as Participant;
          if (!p || p.participant_id === selfId) break;
          setParticipants((cur) =>
            cur.some((x) => x.participant_id === p.participant_id) ? cur : [...cur, p],
          );
          // they will offer to us; we just wait.
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
          break;
        }
        case "signal": {
          const from = msg.from as string;
          const fromName =
            participantsRef.current.find((p) => p.participant_id === from)?.name ||
            "Peer";
          rtc.handleSignal(from, fromName, msg.payload);
          break;
        }
        case "state": {
          rtc.updatePeer(msg.from, {
            audio: !!msg.audio,
            video: !!msg.video,
            screen: !!msg.screen,
          });
          break;
        }
        case "raise-hand": {
          rtc.updatePeer(msg.from, { raisedHand: !!msg.value });
          break;
        }
        case "reaction": {
          const id = Date.now() + Math.random();
          setFloating((cur) => [...cur, { id, from: msg.from, emoji: msg.emoji }]);
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

  // refs to dodge stale closures
  const participantsRef = useRef<Participant[]>([]);
  participantsRef.current = participants;
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const toggleAudioRef = useRef<(force?: boolean) => void>(() => {});

  // ---- socket ----
  const { state: socketState, send } = useSocket(
    stage === "in-meeting" ? meetingId : null,
    selfId,
    onSocketMessage,
  );
  sendRef.current = send;

  // ---- fetch meeting on mount ----
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await api.get(meetingId);
        if (!alive) return;
        setMeeting(m);
        setStage("prejoin");
      } catch (e: any) {
        setErrorMsg(e?.message?.includes("404") ? "Meeting not found" : e?.message);
        setStage("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [meetingId]);

  // ---- join after pre-join submit ----
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

      setStage("in-meeting");
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not join meeting");
      setStage("error");
    }
  };

  // ---- broadcast local audio/video state ----
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
      // stop screen share, restore camera
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
        const ds = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
        const track: MediaStreamTrack = ds.getVideoTracks()[0];
        track.onended = () => {
          // user clicked browser stop → revert
          toggleScreenShare();
        };
        // swap with the cam track
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

  const leave = useCallback(() => {
    setStage("left");
  }, []);

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

  // ---- render ----
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

  // in-meeting
  const peersArr: RemotePeer[] = Array.from(rtc.peers.values());

  const selfName = storage.getName() || "You";

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

  // Spotlight resolution: explicit pin → whoever is screen-sharing → first peer
  const screenSharer = tiles.find((t) => t.screen);
  const spotlightId = pinnedId ?? screenSharer?.id ?? null;

  // Auto-switch to speaker view when someone starts screen-sharing
  // (unless the user has manually picked a view)
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
            <div className="text-sm font-semibold truncate">{meeting?.title || "Meeting"}</div>
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

          {/* Layout toggle */}
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

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 p-3 sm:p-4 overflow-hidden relative">
          <VideoGrid
            mode={effectiveMode}
            tiles={tiles}
            spotlightId={spotlightId}
            pinnedId={pinnedId}
            onTogglePin={togglePin}
          />

          {/* floating reactions */}
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
        onLeave={leave}
      />

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
