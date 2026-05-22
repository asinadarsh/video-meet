from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Zoom Clone API"
    app_env: str = "development"
    database_url: str = "sqlite:///./zoom_clone.db"
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3010,http://127.0.0.1:3010"
    )
    redis_url: str = ""

    # Self-ping keeps free-tier hosts (Render, Fly, Railway) from
    # auto-sleeping while the app is alive. Set to the app's public URL
    # in production; leave empty to disable.
    ping_url: str = ""
    ping_interval_seconds: int = 600  # 10 min — Render sleeps after 15.

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
