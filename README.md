# Zoom Clone — Video Conferencing Platform

> 🟢 **Live Demo:** https://video-meet-theta.vercel.app
> 🔌 **API:** https://video-meet-api.onrender.com · **Docs:** https://video-meet-api.onrender.com/docs
> 💾 **Repo:** https://github.com/asinadarsh/video-meet

A production-ready Zoom-style web conferencing app built with **Next.js 15** (frontend), **FastAPI** (backend), **WebRTC** (mesh peer-to-peer media), **WebSockets** (real-time signaling + chat), and **SQLite** (persistence). Designed so chat & signaling can scale horizontally by swapping the in-memory broker for **Redis Pub/Sub**.

> _Note: the API runs on Render's free tier and sleeps after 15 min of inactivity — the first request after idle may take 30–60 s to cold-start, after which everything responds instantly._

## Highlights

- Instant meetings, scheduled meetings, join-by-ID, copyable invite links
- Pre-join screen with camera/mic preview
- Mesh WebRTC (up to ~6 participants) with mute/camera/screen-share
- Real-time chat with typing indicators, history persisted in SQLite
- Live participant list with host actions: mute, mute-all, remove, end
- Raise hand + emoji reactions (floating animation)
- Responsive layout: desktop, tablet, mobile
- Zoom-inspired dark theme

---

## Repository Layout

```
zoom-clone/
├── backend/                  FastAPI service
│   ├── app/
│   │   ├── main.py           App factory + lifespan
│   │   ├── config.py         Pydantic settings (env)
│   │   ├── database.py       SQLAlchemy engine + session
│   │   ├── models/           ORM models
│   │   ├── schemas/          Pydantic DTOs
│   │   ├── routes/           REST routers
│   │   ├── services/         Domain logic (no HTTP/WS coupling)
│   │   ├── websocket/
│   │   │   ├── broker.py     In-memory or Redis Pub/Sub
│   │   │   ├── manager.py    ConnectionManager (rooms)
│   │   │   └── handler.py    /ws/meetings/{id} endpoint + router
│   │   └── utils/            id generators, helpers
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                 Next.js 15 (App Router, TS, Tailwind v4)
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx                 Dashboard
    │   │   └── meeting/[id]/page.tsx    Meeting room
    │   ├── components/
    │   │   ├── dashboard/   ActionCards, MeetingList, ScheduleForm
    │   │   ├── meeting/     PreJoin, VideoGrid, VideoTile, Controls,
    │   │   │               ChatPanel, ParticipantsPanel
    │   │   └── ui/          Button, Modal
    │   ├── hooks/           useSocket, useMedia, useWebRTC
    │   └── lib/             api, types, storage, utils
    └── .env.local.example
```

---

## Architecture

```
        Browser A                                  Browser B
   ┌─────────────────┐                       ┌─────────────────┐
   │   Next.js UI    │                       │   Next.js UI    │
   │  + WebRTC PCs   │◀ ─ ─ ─ media (P2P) ─ ▶│  + WebRTC PCs   │
   └────────┬────────┘                       └────────┬────────┘
            │ WebSocket (chat + signaling + state)    │
            ▼                                         ▼
        ┌────────────────────────────────────────────────┐
        │  FastAPI  ─  /api/meetings/*  /ws/meetings/{id} │
        │           ConnectionManager ──▶ Broker          │
        │                                  │              │
        │            InMemoryBroker ◀──────┴─────▶ RedisBroker
        │                                            (multi-instance fanout)
        │            SQLAlchemy ──▶ SQLite (meetings, participants, chat)
        └────────────────────────────────────────────────┘
```

### How real-time scales

The WebSocket layer never talks to other connections directly. It publishes to a `Broker`. With the default `InMemoryBroker`, a publish hits handlers in the same process — perfect for one box. Set `REDIS_URL` and the `RedisBroker` swaps in: every backend instance subscribes to `meeting:{id}` and re-fans-out to its local sockets. The application code is unchanged.

### WebRTC strategy

**Mesh peer-to-peer.** Each participant maintains one `RTCPeerConnection` per other participant. Each new joiner initiates the offer to everyone already in the room; existing members wait for the offer. This trades scalability (≤ ~6 reliable peers) for zero media-server complexity — appropriate for the assignment's "WebRTC fundamentals" scope. For larger rooms, swap in an SFU like mediasoup or LiveKit.

Signaling messages are forwarded by the server but never inspected — the backend doesn't need to understand SDP/ICE.

---

## Database Schema

| Table              | Purpose                                                |
|--------------------|--------------------------------------------------------|
| `meetings`         | Meeting metadata (id, host, schedule, status, tokens)  |
| `participants`     | One row per join (joined_at, left_at, is_host)         |
| `chat_messages`    | Persisted chat history per meeting                     |
| `meeting_sessions` | One row per time the meeting becomes active            |

Relationships: `Meeting 1—N Participant`, `Meeting 1—N ChatMessage`, `Meeting 1—N MeetingSession`. All cascade-delete on meeting removal.

Meeting IDs are generated as `xxx-xxxx-xxx` (10 digits, dash-separated) — collision-checked at insert time.

---

## REST API

Base URL: `${NEXT_PUBLIC_API_URL}` (default `http://127.0.0.1:8001`).

| Method | Path                                  | Body / Query                                    | Returns                |
|--------|---------------------------------------|-------------------------------------------------|------------------------|
| POST   | `/api/meetings`                       | `{ host_name, title?, description?, duration_minutes? }` | Meeting + host_token |
| POST   | `/api/meetings/schedule`              | `{ title, host_name, scheduled_for, ... }`      | Meeting + host_token |
| GET    | `/api/meetings/upcoming`              | `?limit=20`                                     | Meeting[]              |
| GET    | `/api/meetings/recent`                | `?limit=20`                                     | Meeting[]              |
| GET    | `/api/meetings/{id}`                  | —                                               | Meeting                |
| POST   | `/api/meetings/{id}/join`             | `{ name, host_token? }`                         | JoinResponse           |
| POST   | `/api/meetings/{id}/end`              | `?host_token=...`                               | Meeting                |
| GET    | `/api/meetings/{id}/chat`             | `?limit=200`                                    | ChatMessage[]          |
| GET    | `/api/meetings/{id}/participants`     | —                                               | Participant[]          |
| GET    | `/health`                             | —                                               | `{status, env, redis}` |

Interactive docs: `http://127.0.0.1:8001/docs`.

### WebSocket protocol

URL: `ws://127.0.0.1:8001/ws/meetings/{meeting_id}?participant_id={pid}`

The `participant_id` must be obtained via `POST /api/meetings/{id}/join` first.

**Client → Server**

| `type`       | Payload                                                 |
|--------------|---------------------------------------------------------|
| `chat`       | `{ content: string }`                                   |
| `signal`     | `{ target: pid, payload: { kind, sdp?, candidate? } }`  |
| `state`      | `{ audio: bool, video: bool, screen: bool }`            |
| `raise-hand` | `{ value: bool }`                                       |
| `reaction`   | `{ emoji: string }`                                     |
| `typing`     | `{ value: bool }`                                       |
| `host-action`| `{ action: "mute"|"mute-all"|"remove"|"end", target? }` |

**Server → Client**

| `type`               | Payload                                          |
|----------------------|--------------------------------------------------|
| `init`               | `{ self_id, participants[] }`                    |
| `participant-joined` | `{ participant }`                                |
| `participant-left`   | `{ participant_id }`                             |
| `chat`               | `{ message }`                                    |
| `signal`             | `{ from, payload }`                              |
| `state`              | `{ from, audio, video, screen }`                 |
| `raise-hand`         | `{ from, value }`                                |
| `reaction`           | `{ from, emoji }`                                |
| `typing`             | `{ from, value }`                                |
| `force-mute`         | `{ target?: pid }`                               |
| `removed` / `ended`  | `{}`                                             |

---

## Setup

### Prerequisites

- Python 3.11+ (tested on 3.13)
- Node.js 20+ (tested on 22)
- A modern browser (Chrome / Edge / Firefox / Safari)

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
copy .env.example .env            # or `cp` on *nix
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

The first request creates `zoom_clone.db` automatically. OpenAPI UI: `http://127.0.0.1:8001/docs`.

### 2. Frontend

```bash
cd frontend
copy .env.local.example .env.local
npm install
npm run dev -- --port 3010
```

Open `http://localhost:3010`.

### Environment variables

**backend/.env**
| Var             | Default                                           | Notes |
|-----------------|---------------------------------------------------|-------|
| `APP_NAME`      | Zoom Clone API                                    |       |
| `APP_ENV`       | development                                       |       |
| `DATABASE_URL`  | `sqlite:///./zoom_clone.db`                       | Any SQLAlchemy URL works (Postgres in prod) |
| `CORS_ORIGINS`  | `http://localhost:3000,http://127.0.0.1:3000`     | Comma-separated |
| `REDIS_URL`     | _(empty — uses in-memory broker)_                  | e.g. `redis://localhost:6379/0` to enable Pub/Sub |

**frontend/.env.local**
| Var                    | Default                  |
|------------------------|--------------------------|
| `NEXT_PUBLIC_API_URL`  | `http://127.0.0.1:8001`  |
| `NEXT_PUBLIC_WS_URL`   | `ws://127.0.0.1:8001`    |

---

## Try It

1. Open `http://localhost:3010` and enter a name.
2. Click **New Meeting** → you're host of an instant room.
3. Copy the invite link, open it in a second browser tab / window / device (sign-in works without auth).
4. Toggle camera/mic, share screen, send chat messages, raise hand, react with emoji.
5. As host: open **People**, hover a participant → mute or remove. Click **Mute all** in the control bar.

The dashboard's **Upcoming** and **Recent** lists update automatically when you reload.

---

## Production Deployment

### Frontend (Vercel)

1. Push the repo to GitHub.
2. Import into Vercel; set root directory to `frontend/`.
3. Add env vars `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` pointing to your backend (https / wss).
4. Deploy — Vercel handles the rest.

### Backend (Render / Railway / Fly)

1. New Web Service from this repo, root `backend/`.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add env vars (`CORS_ORIGINS` must include your Vercel frontend URL; set `REDIS_URL` if you scale beyond one instance).
5. Add a persistent disk for `zoom_clone.db` (or swap to Postgres via `DATABASE_URL`).

### Horizontal scaling

To run multiple backend instances behind a load balancer:

1. Provision a Redis instance (Upstash, Redis Cloud, Render Redis).
2. `pip install redis>=5` and set `REDIS_URL=redis://...` on every instance.
3. Sticky WebSocket sessions are still recommended at the LB so a participant doesn't reconnect to a different instance mid-meeting — but cross-instance fanout works because every instance subscribes to the same `meeting:{id}` channel.

---

## Design Decisions & Assumptions

- **Auth is optional.** Hosts get a `host_token` returned on create; the frontend stores it in `localStorage` so the same browser becomes host when rejoining. This is a stub seam — wiring a real auth layer (JWT / session cookies) is a drop-in change in `routes/meetings.py`.
- **Mesh WebRTC over SFU.** Simpler to demonstrate WebRTC fundamentals; comfortable up to ~6 peers. An SFU is the next step for production scale.
- **SQLite by default.** Zero-config, ships as a single file. Production swaps in Postgres via `DATABASE_URL`.
- **In-memory broker by default, Redis on demand.** The application boundary at `Broker` keeps the path between MVP and horizontally-scaled identical.
- **No TURN server.** STUN-only ICE works on most home networks; symmetric NAT will fail. Production should add a TURN server (Coturn, or managed: Twilio, Xirsys).
- **Joining a scheduled meeting** is allowed up to 10 minutes before the scheduled start; earlier joins return 403.
- **Recordings are not implemented.** This would require either client-side `MediaRecorder` (per-peer, then merged) or a media server.

---

## Roadmap (Bonus Features)

- Recording (client-side via `MediaRecorder`)
- Waiting room / host approval
- End-to-end encryption (Insertable Streams)
- Background blur / virtual backgrounds (MediaPipe / TF.js)
- Captions (Whisper streaming)
- Mobile native (React Native with `react-native-webrtc`)

---

## License

MIT
