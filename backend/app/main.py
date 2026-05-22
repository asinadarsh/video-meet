from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, engine
from app import models  # noqa: F401 — register models with Base before create_all
from app.routes.meetings import router as meetings_router
from app.websocket.broker import build_broker
from app.websocket.manager import ConnectionManager
from app.websocket.handler import register_ws_routes

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    broker = build_broker(settings.redis_url or None)
    manager = ConnectionManager(broker)
    app.state.broker = broker
    app.state.manager = manager
    register_ws_routes(app, manager)
    yield
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
    }


@app.get("/")
def root():
    return {"message": "Zoom Clone API", "docs": "/docs"}
