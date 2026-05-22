"""WebSocket endpoint + message router.

URL: /ws/meetings/{meeting_id}?participant_id=...

Client → Server message types:
  chat            { content: str }
  signal          { target: str, payload: any }
  state           { audio: bool, video: bool, screen: bool }
  raise-hand      { value: bool }
  reaction        { emoji: str }
  typing          { value: bool }
  level           { value: number (0-1) }      # active-speaker volume
  caption         { text: str, final: bool }   # live captions
  host-action     { action: "mute"|"mute-all"|"remove"|"end"|
                            "admit"|"deny"|"lock"|"unlock",
                    target?: str }

Server → Client message types:
  init                  { self_id, participants, lobby_enabled, locked, waiting? }
  in-lobby              {}                   # waiting joiner
  admitted              {}                   # we were just admitted
  lobby-knock           { participant }      # host only
  lobby-leave           { participant_id }   # host only
  participant-joined / participant-left
  chat                  { message }
  signal                { from, payload }
  state                 { from, audio, video, screen }
  raise-hand            { from, value }
  reaction              { from, emoji }
  typing                { from, value }
  level                 { from, value }
  caption               { from, name, text, final }
  meeting-state         { lobby_enabled, locked }
  force-mute            { target }
  removed               { reason }
  ended                 {}
  error                 { message }
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.services import meeting_service as svc
from app.schemas.chat import ChatMessageOut
from app.websocket.manager import ConnectionManager, Connection

logger = logging.getLogger(__name__)
router = APIRouter()


def _admitted_payload(db: Session, meeting_id: str) -> list[dict]:
    return [
        {
            "participant_id": p.participant_id,
            "name": p.name,
            "is_host": p.is_host,
            "joined_at": p.joined_at.isoformat() if p.joined_at else None,
        }
        for p in svc.list_active_participants(db, meeting_id)
    ]


def _waiting_payload(db: Session, meeting_id: str) -> list[dict]:
    return [
        {
            "participant_id": p.participant_id,
            "name": p.name,
            "joined_at": p.joined_at.isoformat() if p.joined_at else None,
        }
        for p in svc.list_waiting_participants(db, meeting_id)
    ]


def register_ws_routes(app, manager: ConnectionManager) -> None:
    @app.websocket("/ws/meetings/{meeting_id}")
    async def meeting_ws(
        websocket: WebSocket,
        meeting_id: str,
        participant_id: str = Query(...),
    ):
        db = SessionLocal()
        try:
            meeting = svc.get_meeting(db, meeting_id)
            if not meeting:
                await websocket.close(code=4404)
                return

            participant = svc.get_participant(db, participant_id)
            if not participant or participant.meeting_id != meeting_id:
                await websocket.close(code=4401)
                return
            if participant.status == "denied" or participant.left_at is not None:
                await websocket.close(code=4403)
                return

            ok, reason = svc.is_meeting_joinable(meeting, is_host=participant.is_host)
            if not ok:
                await websocket.close(code=4403)
                return

            conn = Connection(websocket, participant_id, participant.name, participant.is_host)
            is_waiting = participant.status == "waiting"
            lobby_enabled = bool(meeting.lobby_enabled)
            locked = bool(meeting.locked)
        finally:
            db.close()

        await websocket.accept()
        await manager.connect(meeting_id, conn)

        db = SessionLocal()
        try:
            await websocket.send_json({
                "type": "init",
                "self_id": participant_id,
                "is_host": conn.is_host,
                "in_lobby": is_waiting,
                "lobby_enabled": lobby_enabled,
                "locked": locked,
                "participants": _admitted_payload(db, meeting_id),
                "waiting": _waiting_payload(db, meeting_id) if conn.is_host else [],
            })
        finally:
            db.close()

        if is_waiting:
            # Tell the host(s) that someone is knocking.
            await manager.publish(meeting_id, {
                "type": "lobby-knock",
                "participant": {
                    "participant_id": conn.participant_id,
                    "name": conn.name,
                    "joined_at": datetime.utcnow().isoformat(),
                },
                "__hosts_only__": True,
            })
        else:
            await manager.publish(meeting_id, {
                "type": "participant-joined",
                "participant": {
                    "participant_id": conn.participant_id,
                    "name": conn.name,
                    "is_host": conn.is_host,
                    "joined_at": datetime.utcnow().isoformat(),
                },
            })

        try:
            while True:
                msg = await websocket.receive_json()
                await _handle_message(manager, meeting_id, conn, msg)
        except WebSocketDisconnect:
            pass
        except Exception:
            logger.exception("WebSocket error for %s in %s", participant_id, meeting_id)
        finally:
            await manager.disconnect(meeting_id, participant_id)
            db = SessionLocal()
            was_waiting = False
            try:
                p = svc.get_participant(db, participant_id)
                if p:
                    was_waiting = p.status == "waiting"
                svc.mark_participant_left(db, participant_id)
            finally:
                db.close()
            if was_waiting:
                await manager.publish(meeting_id, {
                    "type": "lobby-leave",
                    "participant_id": participant_id,
                    "__hosts_only__": True,
                })
            else:
                await manager.publish(meeting_id, {
                    "type": "participant-left",
                    "participant_id": participant_id,
                })


async def _handle_message(manager: ConnectionManager, meeting_id: str, conn: Connection, msg: dict) -> None:
    mtype = msg.get("type")

    if mtype == "chat":
        content = (msg.get("content") or "").strip()
        if not content:
            return
        db = SessionLocal()
        try:
            saved = svc.save_chat_message(
                db, meeting_id, conn.participant_id, conn.name, content
            )
            payload = ChatMessageOut.model_validate(saved).model_dump(mode="json")
        finally:
            db.close()
        await manager.publish(meeting_id, {"type": "chat", "message": payload})
        return

    if mtype == "signal":
        target = msg.get("target")
        if not target:
            return
        await manager.send_to(meeting_id, target, {
            "type": "signal",
            "from": conn.participant_id,
            "payload": msg.get("payload"),
        })
        return

    if mtype == "state":
        await manager.publish(meeting_id, {
            "type": "state",
            "from": conn.participant_id,
            "audio": bool(msg.get("audio", True)),
            "video": bool(msg.get("video", True)),
            "screen": bool(msg.get("screen", False)),
        })
        return

    if mtype == "raise-hand":
        await manager.publish(meeting_id, {
            "type": "raise-hand",
            "from": conn.participant_id,
            "value": bool(msg.get("value", False)),
        })
        return

    if mtype == "reaction":
        await manager.publish(meeting_id, {
            "type": "reaction",
            "from": conn.participant_id,
            "emoji": str(msg.get("emoji", ""))[:8],
        })
        return

    if mtype == "typing":
        await manager.publish(meeting_id, {
            "type": "typing",
            "from": conn.participant_id,
            "value": bool(msg.get("value", False)),
        })
        return

    if mtype == "level":
        try:
            value = float(msg.get("value", 0.0))
        except (TypeError, ValueError):
            return
        value = max(0.0, min(1.0, value))
        await manager.publish(meeting_id, {
            "type": "level",
            "from": conn.participant_id,
            "value": value,
        })
        return

    if mtype == "caption":
        text = str(msg.get("text", ""))[:500]
        if not text:
            return
        await manager.publish(meeting_id, {
            "type": "caption",
            "from": conn.participant_id,
            "name": conn.name,
            "text": text,
            "final": bool(msg.get("final", False)),
        })
        return

    if mtype == "host-action":
        if not conn.is_host:
            await conn.ws.send_json({"type": "error", "message": "Host only"})
            return
        action = msg.get("action")
        target = msg.get("target")

        if action == "mute-all":
            await manager.publish(meeting_id, {"type": "force-mute", "target": None})
        elif action == "mute" and target:
            await manager.send_to(meeting_id, target, {"type": "force-mute", "target": target})
        elif action == "remove" and target:
            await manager.send_to(meeting_id, target, {"type": "removed", "reason": "Removed by host"})
            await manager.publish(meeting_id, {
                "type": "participant-left",
                "participant_id": target,
            })
        elif action == "admit" and target:
            db = SessionLocal()
            try:
                p = svc.admit_participant(db, target)
            finally:
                db.close()
            if p:
                # Tell the admitted user.
                await manager.send_to(meeting_id, target, {"type": "admitted"})
                # Tell everyone else they're now in the room.
                await manager.publish(meeting_id, {
                    "type": "participant-joined",
                    "participant": {
                        "participant_id": p.participant_id,
                        "name": p.name,
                        "is_host": p.is_host,
                        "joined_at": p.joined_at.isoformat() if p.joined_at else None,
                    },
                })
                # Remove them from every host's lobby list.
                await manager.publish(meeting_id, {
                    "type": "lobby-leave",
                    "participant_id": target,
                    "__hosts_only__": True,
                })
        elif action == "deny" and target:
            db = SessionLocal()
            try:
                svc.deny_participant(db, target)
            finally:
                db.close()
            await manager.send_to(meeting_id, target, {
                "type": "removed", "reason": "Denied by host",
            })
            await manager.publish(meeting_id, {
                "type": "lobby-leave",
                "participant_id": target,
                "__hosts_only__": True,
            })
        elif action in ("lock", "unlock", "enable-lobby", "disable-lobby"):
            db = SessionLocal()
            payload = None
            try:
                meeting = svc.get_meeting(db, meeting_id)
                if meeting:
                    if action == "lock":
                        svc.set_locked(db, meeting, True)
                    elif action == "unlock":
                        svc.set_locked(db, meeting, False)
                    elif action == "enable-lobby":
                        svc.set_lobby(db, meeting, True)
                    elif action == "disable-lobby":
                        svc.set_lobby(db, meeting, False)
                    payload = {
                        "type": "meeting-state",
                        "lobby_enabled": bool(meeting.lobby_enabled),
                        "locked": bool(meeting.locked),
                    }
            finally:
                db.close()
            if payload:
                await manager.publish(meeting_id, payload)
        elif action == "end":
            db = SessionLocal()
            try:
                meeting = svc.get_meeting(db, meeting_id)
                if meeting:
                    svc.end_meeting(db, meeting)
            finally:
                db.close()
            await manager.publish(meeting_id, {"type": "ended"})
        return
