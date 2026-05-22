import asyncio
import logging
from contextlib import asynccontextmanager
from urllib.request import Request as URLRequest, urlopen
from urllib.error import URLError

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, engine
from app import models  # noqa: F401 — register models with Base before create_all
from app.routes.meetings import router as meetings_router
from app.websocket.broker import build_broker
from app.websocket.manager import ConnectionManager
from app.websocket.handler import register_ws_routes

logger = logging.getLogger(__name__)
settings = get_settings()


async def _self_ping_loop(url: str, interval_seconds: int) -> None:
    """Hit our own public /health URL periodically so the platform's
    idle-sleep timer never fires while the process is alive.

    Render's free tier sleeps after 15 min of no inbound HTTP. An
    internal asyncio sleep doesn't count — the request has to come back
    in through the public load balancer, which is exactly what this
    does (urlopen → public DNS → Render LB → us)."""
    target = f"{url.rstrip('/')}/health"
    # Small startup delay so the first ping doesn't race the boot.
    await asyncio.sleep(min(60, interval_seconds))
    while True:
        try:
            await asyncio.to_thread(
                lambda: urlopen(URLRequest(target, headers={"User-Agent": "self-ping/1.0"}), timeout=10)
            )
            logger.info("self-ping ok → %s", target)
        except URLError as e:
            logger.warning("self-ping failed: %s", e)
        except Exception:
            logger.exception("self-ping crashed")
        await asyncio.sleep(interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    broker = build_broker(settings.redis_url or None)
    manager = ConnectionManager(broker)
    app.state.broker = broker
    app.state.manager = manager
    register_ws_routes(app, manager)

    ping_task: asyncio.Task | None = None
    if settings.ping_url:
        ping_task = asyncio.create_task(
            _self_ping_loop(settings.ping_url, settings.ping_interval_seconds)
        )

    try:
        yield
    finally:
        if ping_task:
            ping_task.cancel()
            try:
                await ping_task
            except asyncio.CancelledError:
                pass
        await broker.close()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.app_env,
        "redis": bool(settings.redis_url),
        "self_ping": bool(settings.ping_url),
    }


@app.get("/")
def root():
    return {"message": "Zoom Clone API", "docs": "/docs"}
