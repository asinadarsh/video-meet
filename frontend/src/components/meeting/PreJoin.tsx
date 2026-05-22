"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video as VideoIcon, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function PreJoin({
  meetingTitle,
  defaultName,
  onJoin,
}: {
  meetingTitle: string;
  defaultName: string;
  onJoin: (args: { name: string; audio: boolean; video: boolean }) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [audio, setAudio] = useState(true);
  const [video, setVideo] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(s);
      } catch (e: any) {
        setError(e?.message || "Could not access camera/microphone");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = audio));
  }, [stream, audio]);

  useEffect(() => {
    stream?.getVideoTracks().forEach((t) => (t.enabled = video));
  }, [stream, video]);

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    stream?.getTracks().forEach((t) => t.stop());
    onJoin({ name: n, audio, video });
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[var(--border)]">
          <h1 className="text-xl font-semibold">{meetingTitle}</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Choose your audio and video settings before joining.</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="relative aspect-video rounded-xl overflow-hidden bg-black grid place-items-center">
            {video && stream ? (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
            ) : (
              <div className="text-[var(--muted)] text-sm">Camera is off</div>
            )}
            {error && <div className="absolute inset-0 grid place-items-center text-sm text-[var(--danger)] bg-black/80">{error}</div>}
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setAudio((v) => !v)}
              className={`size-11 grid place-items-center rounded-full ${audio ? "bg-[var(--surface-2)]" : "bg-[var(--danger)]"} text-white`}
              aria-label="Toggle mic"
            >{audio ? <Mic className="size-5" /> : <MicOff className="size-5" />}</button>
            <button
              onClick={() => setVideo((v) => !v)}
              className={`size-11 grid place-items-center rounded-full ${video ? "bg-[var(--surface-2)]" : "bg-[var(--danger)]"} text-white`}
              aria-label="Toggle camera"
            >{video ? <VideoIcon className="size-5" /> : <VideoOff className="size-5" />}</button>
          </div>
          <label className="block">
            <span className="block text-sm text-[var(--muted)] mb-1.5">Your name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </label>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={!name.trim()}>Join meeting</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
