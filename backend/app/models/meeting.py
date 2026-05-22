from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(20), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False, default="Zoom Meeting")
    description = Column(Text, nullable=True)

    host_name = Column(String(120), nullable=False, default="Host")
    host_token = Column(String(64), unique=True, nullable=False)

    scheduled_for = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=False, default=60)

    # scheduled | active | ended
    status = Column(String(20), nullable=False, default="scheduled", index=True)

    # Host-controlled gates
    lobby_enabled = Column(Boolean, nullable=False, default=False)
    locked = Column(Boolean, nullable=False, default=False)

    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    participants = relationship(
        "Participant", back_populates="meeting", cascade="all, delete-orphan"
    )
    chat_messages = relationship(
        "ChatMessage", back_populates="meeting", cascade="all, delete-orphan"
    )
    sessions = relationship(
        "MeetingSession", back_populates="meeting", cascade="all, delete-orphan"
    )
