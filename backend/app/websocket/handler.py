"""WebSocket endpoint + message router.

URL: /ws/meetings/{meeting_id}?participant_id=...

Client → Server message types:
  chat            { content: str }
  signal          { target: str, payload: any }     # WebRTC offer/answer/ice
  state           { audio: bool, video: bool, screen: bool }
  raise-hand      { value: bool }
  reaction        { emoji: str }
  typing          { value: bool }
  host-action     { action: "mute-all"|"remove"|"end", target?: str }

Server → Client message types:
  init            { self_id, participants: [...] }
  participant-joined / participant-left
  chat            { message: {...} }
  signal          { from, payload }
  state           { from, audio, video, screen }
  raise-hand      { from, value }
  reaction        { from, emoji }
  typing          { from, value }
  force-mute      { target }
  removed         { reason }
  ended           {}
  error           { message }
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


def _participants_payload(db: Session, meeting_id: str) -> list[dict]:
    return [
        {
            "participant_id": p.participant_id,
            "name": p.name,
            "is_host": p.is_host,
            "joined_at": p.joined_at.isoformat() if p.joined_at else None,
        }
        for p in svc.list_active_participants(db, meeting_id)
    ]


def register_ws_routes(app, manager: ConnectionManager) -> None:
    @app.websocket("/ws/meetings/{meeting_id}")
    async def meeting_ws(
        websocket: WebSocket,
        meeting_id: str,
        participant_id: str = Query(...),
    ):
        # validate meeting + participant
        db = SessionLocal()
        try:
            meeting = svc.get_meeting(db, meeting_id)
            if not meeting:
                await websocket.close(code=4404)
                return
            ok, reason = svc.is_meeting_joinable(meeting)
            if not ok:
                await websocket.close(code=4403)
                return

            participant = next(
                (p for p in svc.list_active_participants(db, meeting_id) if p.participant_id == participant_id),
                None,
            )
            if not participant:
                await websocket.close(code=4401)
                return

            conn = Connection(websocket, participant_id, participant.name, participant.is_host)
        finally:
            db.close()

        await websocket.accept()
        await manager.connect(meeting_id, conn)

        # tell the new joiner who is already here
        db = SessionLocal()
        try:
            await websocket.send_json({
                "type": "init",
                "self_id": participant_id,
                "participants": _participants_payload(db, meeting_id),
            })
        finally:
            db.close()

        # announce to others
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
            try:
                svc.mark_participant_left(db, participant_id)
            finally:
                db.close()
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
