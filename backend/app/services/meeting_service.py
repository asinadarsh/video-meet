"""Meeting domain logic — separated from HTTP layer."""
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models import Meeting, Participant, ChatMessage, MeetingSession
from app.schemas.meeting import MeetingCreate, MeetingSchedule
from app.utils.ids import generate_meeting_id, generate_token


def _unique_meeting_id(db: Session) -> str:
    for _ in range(8):
        mid = generate_meeting_id()
        exists = db.scalar(select(Meeting.id).where(Meeting.meeting_id == mid))
        if not exists:
            return mid
    raise RuntimeError("Could not generate a unique meeting id")


def create_instant_meeting(db: Session, payload: MeetingCreate) -> Meeting:
    now = datetime.now(timezone.utc)
    meeting = Meeting(
        meeting_id=_unique_meeting_id(db),
        title=payload.title or "Instant Meeting",
        description=payload.description,
        host_name=payload.host_name,
        host_token=generate_token(),
        scheduled_for=None,
        duration_minutes=payload.duration_minutes,
        status="active",
        started_at=now,
    )
    db.add(meeting)
    db.flush()
    db.add(MeetingSession(meeting_id=meeting.meeting_id, started_at=now))
    db.commit()
    db.refresh(meeting)
    return meeting


def schedule_meeting(db: Session, payload: MeetingSchedule) -> Meeting:
    meeting = Meeting(
        meeting_id=_unique_meeting_id(db),
        title=payload.title,
        description=payload.description,
        host_name=payload.host_name,
        host_token=generate_token(),
        scheduled_for=payload.scheduled_for,
        duration_minutes=payload.duration_minutes,
        status="scheduled",
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def get_meeting(db: Session, meeting_id: str) -> Optional[Meeting]:
    return db.scalar(select(Meeting).where(Meeting.meeting_id == meeting_id))


def upcoming_meetings(db: Session, limit: int = 20) -> List[Meeting]:
    now = datetime.now(timezone.utc)
    stmt = (
        select(Meeting)
        .where(Meeting.status == "scheduled", Meeting.scheduled_for >= now)
        .order_by(Meeting.scheduled_for.asc())
        .limit(limit)
    )
    return list(db.scalars(stmt))


def recent_meetings(db: Session, limit: int = 20) -> List[Meeting]:
    """Active or ended, ordered by most recent activity."""
    stmt = (
        select(Meeting)
        .where(Meeting.status.in_(["active", "ended"]))
        .order_by(
            func.coalesce(Meeting.ended_at, Meeting.started_at, Meeting.created_at).desc()
        )
        .limit(limit)
    )
    return list(db.scalars(stmt))


def participant_count(db: Session, meeting_id: str) -> int:
    return db.scalar(
        select(func.count(Participant.id)).where(
            Participant.meeting_id == meeting_id,
            Participant.left_at.is_(None),
            Participant.status == "admitted",
        )
    ) or 0


def list_active_participants(db: Session, meeting_id: str) -> List[Participant]:
    """Admitted participants who haven't left."""
    stmt = (
        select(Participant)
        .where(
            Participant.meeting_id == meeting_id,
            Participant.left_at.is_(None),
            Participant.status == "admitted",
        )
        .order_by(Participant.joined_at.asc())
    )
    return list(db.scalars(stmt))


def list_waiting_participants(db: Session, meeting_id: str) -> List[Participant]:
    stmt = (
        select(Participant)
        .where(
            Participant.meeting_id == meeting_id,
            Participant.left_at.is_(None),
            Participant.status == "waiting",
        )
        .order_by(Participant.joined_at.asc())
    )
    return list(db.scalars(stmt))


def get_participant(db: Session, participant_id: str) -> Optional[Participant]:
    return db.scalar(select(Participant).where(Participant.participant_id == participant_id))


def admit_participant(db: Session, participant_id: str) -> Optional[Participant]:
    p = get_participant(db, participant_id)
    if p and p.status == "waiting":
        p.status = "admitted"
        db.commit()
        db.refresh(p)
    return p


def deny_participant(db: Session, participant_id: str) -> Optional[Participant]:
    p = get_participant(db, participant_id)
    if p:
        p.status = "denied"
        p.left_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(p)
    return p


def set_lobby(db: Session, meeting: Meeting, enabled: bool) -> Meeting:
    meeting.lobby_enabled = enabled
    db.commit()
    db.refresh(meeting)
    return meeting


def set_locked(db: Session, meeting: Meeting, locked: bool) -> Meeting:
    meeting.locked = locked
    db.commit()
    db.refresh(meeting)
    return meeting


def is_meeting_joinable(meeting: Meeting, is_host: bool = False) -> Tuple[bool, str]:
    """Return (ok, reason). Hosts can always join their own meetings."""
    if meeting.status == "ended":
        return False, "This meeting has ended."
    if meeting.locked and not is_host:
        return False, "This meeting is locked by the host."
    if meeting.status == "scheduled" and meeting.scheduled_for:
        now = datetime.now(timezone.utc)
        scheduled = meeting.scheduled_for
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=timezone.utc)
        if now < scheduled - timedelta(minutes=10) and not is_host:
            return False, "This meeting hasn't started yet."
    return True, ""


def join_meeting(
    db: Session, meeting: Meeting, name: str, host_token: Optional[str]
) -> Participant:
    is_host = bool(host_token) and host_token == meeting.host_token

    # promote scheduled → active on first join
    if meeting.status == "scheduled":
        now = datetime.now(timezone.utc)
        meeting.status = "active"
        meeting.started_at = now
        db.add(MeetingSession(meeting_id=meeting.meeting_id, started_at=now))

    # Lobby gating: non-host joiners wait when lobby is enabled.
    status = "admitted"
    if meeting.lobby_enabled and not is_host:
        status = "waiting"

    participant = Participant(
        participant_id=generate_token(16),
        meeting_id=meeting.meeting_id,
        name=name.strip(),
        is_host=is_host,
        status=status,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def mark_participant_left(db: Session, participant_id: str) -> Optional[Participant]:
    p = db.scalar(select(Participant).where(Participant.participant_id == participant_id))
    if not p:
        return None
    if p.left_at is None:
        p.left_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(p)

    # if no one is left, close out the current MeetingSession
    remaining = participant_count(db, p.meeting_id)
    if remaining == 0:
        open_session = db.scalar(
            select(MeetingSession)
            .where(MeetingSession.meeting_id == p.meeting_id, MeetingSession.ended_at.is_(None))
            .order_by(MeetingSession.started_at.desc())
        )
        if open_session:
            open_session.ended_at = datetime.now(timezone.utc)
            db.commit()
    return p


def end_meeting(db: Session, meeting: Meeting) -> Meeting:
    now = datetime.now(timezone.utc)
    meeting.status = "ended"
    meeting.ended_at = now
    open_session = db.scalar(
        select(MeetingSession)
        .where(MeetingSession.meeting_id == meeting.meeting_id, MeetingSession.ended_at.is_(None))
    )
    if open_session:
        open_session.ended_at = now
    # mark active participants as left
    actives = list_active_participants(db, meeting.meeting_id)
    for p in actives:
        p.left_at = now
    db.commit()
    db.refresh(meeting)
    return meeting


def save_chat_message(
    db: Session, meeting_id: str, participant_id: str, sender_name: str, content: str
) -> ChatMessage:
    msg = ChatMessage(
        meeting_id=meeting_id,
        participant_id=participant_id,
        sender_name=sender_name,
        content=content[:4000],
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def list_chat_messages(db: Session, meeting_id: str, limit: int = 200) -> List[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.meeting_id == meeting_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    return list(db.scalars(stmt))
