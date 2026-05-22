from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Participant(Base):
    __tablename__ = "participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    participant_id = Column(String(64), unique=True, nullable=False, index=True)
    meeting_id = Column(String(20), ForeignKey("meetings.meeting_id"), nullable=False, index=True)

    name = Column(String(120), nullable=False)
    is_host = Column(Boolean, nullable=False, default=False)

    # admitted | waiting | denied
    status = Column(String(20), nullable=False, default="admitted", index=True)

    joined_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    left_at = Column(DateTime(timezone=True), nullable=True)

    meeting = relationship("Meeting", back_populates="participants")
