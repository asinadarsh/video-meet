from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class MeetingCreate(BaseModel):
    title: Optional[str] = Field(default="Instant Meeting", max_length=255)
    description: Optional[str] = None
    host_name: str = Field(..., min_length=1, max_length=120)
    duration_minutes: int = Field(default=60, ge=5, le=24 * 60)


class MeetingSchedule(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    host_name: str = Field(..., min_length=1, max_length=120)
    scheduled_for: datetime
    duration_minutes: int = Field(default=60, ge=5, le=24 * 60)


class MeetingJoin(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    host_token: Optional[str] = None


class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    participant_id: str
    name: str
    is_host: bool
    status: str = "admitted"
    joined_at: datetime
    left_at: Optional[datetime] = None


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    meeting_id: str
    title: str
    description: Optional[str] = None
    host_name: str
    scheduled_for: Optional[datetime] = None
    duration_minutes: int
    status: str
    lobby_enabled: bool = False
    locked: bool = False
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime
    invite_url: Optional[str] = None
    participant_count: int = 0


class MeetingCreated(MeetingOut):
    """Returned on create — includes host_token so creator can act as host."""
    host_token: str


class JoinResponse(BaseModel):
    meeting: MeetingOut
    participant_id: str
    is_host: bool
    status: str = "admitted"  # admitted | waiting
    participants: List[ParticipantOut]
