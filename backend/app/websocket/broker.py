"""Pluggable pub/sub broker.

Default: InMemoryBroker (single-process). For horizontal scaling, swap to
RedisBroker by setting REDIS_URL in env — every backend instance then
publishes/subscribes to `meeting:{id}` channels so chat + signaling stay
in sync across instances.

This is a thin abstraction so the WebSocket layer doesn't care which is
running.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Awaitable, Callable, Dict, Set

logger = logging.getLogger(__name__)

Handler = Callable[[str, dict], Awaitable[None]]  # (room, message) -> awaitable


class Broker:
    async def publish(self, room: str, message: dict) -> None: ...
    async def subscribe(self, room: str, handler: Handler) -> None: ...
    async def unsubscribe(self, room: str, handler: Handler) -> None: ...
    async def close(self) -> None: ...


class InMemoryBroker(Broker):
    def __init__(self) -> None:
        self._handlers: Dict[str, Set[Handler]] = {}
        self._lock = asyncio.Lock()

    async def publish(self, room: str, message: dict) -> None:
        async with self._lock:
            handlers = list(self._handlers.get(room, set()))
        for h in handlers:
            try:
                await h(room, message)
            except Exception:
                logger.exception("Broker handler failed for room=%s", room)

    async def subscribe(self, room: str, handler: Handler) -> None:
        async with self._lock:
            self._handlers.setdefault(room, set()).add(handler)

    async def unsubscribe(self, room: str, handler: Handler) -> None:
        async with self._lock:
            if room in self._handlers:
                self._handlers[room].discard(handler)
                if not self._handlers[room]:
                    self._handlers.pop(room, None)

    async def close(self) -> None:
        async with self._lock:
            self._handlers.clear()


class RedisBroker(Broker):
    """Optional Redis Pub/Sub broker. Activated when REDIS_URL is set.

    Each backend instance subscribes to `meeting:{room}` and fans out messages
    to local websockets. Publish writes to the channel so every instance
    receives the message.

    Requires `redis>=5` (async client). Imported lazily so the MVP runs
    without Redis installed.
    """

    def __init__(self, url: str) -> None:
        try:
            from redis.asyncio import Redis  # type: ignore
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("REDIS_URL is set but `redis` is not installed") from e
        self._url = url
        self._redis = Redis.from_url(url, decode_responses=True)
        self._pubsub = self._redis.pubsub()
        self._handlers: Dict[str, Set[Handler]] = {}
        self._listener_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    def _channel(self, room: str) -> str:
        return f"meeting:{room}"

    async def publish(self, room: str, message: dict) -> None:
        await self._redis.publish(self._channel(room), json.dumps(message))

    async def subscribe(self, room: str, handler: Handler) -> None:
        async with self._lock:
            new_room = room not in self._handlers
            self._handlers.setdefault(room, set()).add(handler)
            if new_room:
                await self._pubsub.subscribe(self._channel(room))
            if self._listener_task is None:
                self._listener_task = asyncio.create_task(self._listen())

    async def unsubscribe(self, room: str, handler: Handler) -> None:
        async with self._lock:
            if room in self._handlers:
                self._handlers[room].discard(handler)
                if not self._handlers[room]:
                    self._handlers.pop(room, None)
                    await self._pubsub.unsubscribe(self._channel(room))

    async def _listen(self) -> None:
        async for raw in self._pubsub.listen():
            if raw.get("type") != "message":
                continue
            channel = raw.get("channel", "")
            room = channel.split(":", 1)[1] if ":" in channel else channel
            try:
                data = json.loads(raw["data"])
            except Exception:
                continue
            handlers = list(self._handlers.get(room, set()))
            for h in handlers:
                try:
                    await h(room, data)
                except Exception:
                    logger.exception("Redis handler failed for room=%s", room)

    async def close(self) -> None:
        if self._listener_task:
            self._listener_task.cancel()
        try:
            await self._pubsub.close()
        finally:
            await self._redis.aclose()


def build_broker(redis_url: str | None) -> Broker:
    if redis_url:
        try:
            return RedisBroker(redis_url)
        except Exception as e:
            logger.warning("Falling back to InMemoryBroker (Redis init failed: %s)", e)
    return InMemoryBroker()
