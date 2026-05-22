from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class MeetingSession(Base):
    """One row per time the meeting becomes active."""

    __tablename__ = "meeting_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(20), ForeignKey("meetings.meeting_id"), nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime(timezone=True), nullable=True)
    peak_participants = Column(Integer, nullable=False, default=0)

    meeting = relationship("Meeting", back_populates="sessions")
