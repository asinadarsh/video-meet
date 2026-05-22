"""Connection manager for meeting rooms.

Tracks live WebSocket connections per meeting and routes messages through
the broker so the same path works whether we're running in a single
process or behind Redis Pub/Sub.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Dict, Set

from fastapi import WebSocket

from app.websocket.broker import Broker

logger = logging.getLogger(__name__)


class Connection:
    def __init__(self, websocket: WebSocket, participant_id: str, name: str, is_host: bool):
        self.ws = websocket
        self.participant_id = participant_id
        self.name = name
        self.is_host = is_host


class ConnectionManager:
    def __init__(self, broker: Broker) -> None:
        self.broker = broker
        self._rooms: Dict[str, Dict[str, Connection]] = {}
        self._lock = asyncio.Lock()
        self._subscribed: Set[str] = set()

    async def connect(self, room: str, conn: Connection) -> None:
        async with self._lock:
            self._rooms.setdefault(room, {})[conn.participant_id] = conn
            if room not in self._subscribed:
                await self.broker.subscribe(room, self._broker_handler)
                self._subscribed.add(room)

    async def disconnect(self, room: str, participant_id: str) -> None:
        async with self._lock:
            if room in self._rooms:
                self._rooms[room].pop(participant_id, None)
                if not self._rooms[room]:
                    self._rooms.pop(room, None)
                    if room in self._subscribed:
                        await self.broker.unsubscribe(room, self._broker_handler)
                        self._subscribed.discard(room)

    def get_room(self, room: str) -> Dict[str, Connection]:
        return self._rooms.get(room, {})

    async def publish(self, room: str, message: dict) -> None:
        """Fan a message out to everyone in the room (across instances)."""
        await self.broker.publish(room, message)

    async def send_to(self, room: str, participant_id: str, message: dict) -> None:
        """Direct DM through the broker so it works across instances too."""
        await self.broker.publish(
            room, {"__direct__": participant_id, "payload": message}
        )

    async def _broker_handler(self, room: str, message: dict) -> None:
        connections = list(self._rooms.get(room, {}).values())
        if not connections:
            return

        if "__direct__" in message:
            target_id = message["__direct__"]
            payload = message["payload"]
            target = self._rooms.get(room, {}).get(target_id)
            if target:
                await self._safe_send(target, payload)
            return

        for c in connections:
            await self._safe_send(c, message)

    async def _safe_send(self, conn: Connection, message: dict) -> None:
        try:
            await conn.ws.send_json(message)
        except Exception:
            logger.debug("send failed for %s; will be cleaned up on disconnect", conn.participant_id)
