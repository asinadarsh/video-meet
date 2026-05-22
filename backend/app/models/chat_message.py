from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(20), ForeignKey("meetings.meeting_id"), nullable=False, index=True)
    participant_id = Column(String(64), nullable=False, index=True)
    sender_name = Column(String(120), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    meeting = relationship("Meeting", back_populates="chat_messages")
