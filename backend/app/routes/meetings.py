from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.meeting import (
    MeetingCreate,
    MeetingSchedule,
    MeetingJoin,
    MeetingOut,
    MeetingCreated,
    JoinResponse,
    ParticipantOut,
)
from app.schemas.chat import ChatMessageOut
from app.services import meeting_service as svc

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _invite_url(request: Request, meeting_id: str) -> str:
    # Frontend invite URL; prefer Origin header (set by browser/proxy), fall back to request base.
    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
    return f"{origin}/meeting/{meeting_id}"


def _to_out(m, request: Request, count: int = 0) -> MeetingOut:
    return MeetingOut(
        meeting_id=m.meeting_id,
        title=m.title,
        description=m.description,
        host_name=m.host_name,
        scheduled_for=m.scheduled_for,
        duration_minutes=m.duration_minutes,
        status=m.status,
        started_at=m.started_at,
        ended_at=m.ended_at,
        created_at=m.created_at,
        invite_url=_invite_url(request, m.meeting_id),
        participant_count=count,
    )


@router.post("", response_model=MeetingCreated, status_code=status.HTTP_201_CREATED)
def create_instant(payload: MeetingCreate, request: Request, db: Session = Depends(get_db)):
    meeting = svc.create_instant_meeting(db, payload)
    out = _to_out(meeting, request, 0)
    return MeetingCreated(**out.model_dump(), host_token=meeting.host_token)


@router.post("/schedule", response_model=MeetingCreated, status_code=status.HTTP_201_CREATED)
def schedule(payload: MeetingSchedule, request: Request, db: Session = Depends(get_db)):
    meeting = svc.schedule_meeting(db, payload)
    out = _to_out(meeting, request, 0)
    return MeetingCreated(**out.model_dump(), host_token=meeting.host_token)


@router.get("/upcoming", response_model=List[MeetingOut])
def upcoming(request: Request, db: Session = Depends(get_db), limit: int = 20):
    items = svc.upcoming_meetings(db, limit=limit)
    return [_to_out(m, request, svc.participant_count(db, m.meeting_id)) for m in items]


@router.get("/recent", response_model=List[MeetingOut])
def recent(request: Request, db: Session = Depends(get_db), limit: int = 20):
    items = svc.recent_meetings(db, limit=limit)
    return [_to_out(m, request, svc.participant_count(db, m.meeting_id)) for m in items]


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: str, request: Request, db: Session = Depends(get_db)):
    meeting = svc.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return _to_out(meeting, request, svc.participant_count(db, meeting_id))


@router.post("/{meeting_id}/join", response_model=JoinResponse)
def join(
    meeting_id: str,
    payload: MeetingJoin,
    request: Request,
    db: Session = Depends(get_db),
):
    meeting = svc.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    ok, reason = svc.is_meeting_joinable(meeting)
    if not ok:
        raise HTTPException(status_code=403, detail=reason)

    participant = svc.join_meeting(db, meeting, payload.name, payload.host_token)
    actives = svc.list_active_participants(db, meeting_id)
    return JoinResponse(
        meeting=_to_out(meeting, request, len(actives)),
        participant_id=participant.participant_id,
        is_host=participant.is_host,
        participants=[ParticipantOut.model_validate(p) for p in actives],
    )


@router.post("/{meeting_id}/end", response_model=MeetingOut)
def end(meeting_id: str, request: Request, host_token: str, db: Session = Depends(get_db)):
    meeting = svc.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if host_token != meeting.host_token:
        raise HTTPException(status_code=403, detail="Only the host can end this meeting")
    meeting = svc.end_meeting(db, meeting)
    return _to_out(meeting, request, 0)


@router.get("/{meeting_id}/chat", response_model=List[ChatMessageOut])
def chat_history(meeting_id: str, db: Session = Depends(get_db), limit: int = 200):
    meeting = svc.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return [ChatMessageOut.model_validate(m) for m in svc.list_chat_messages(db, meeting_id, limit)]


@router.get("/{meeting_id}/participants", response_model=List[ParticipantOut])
def list_participants(meeting_id: str, db: Session = Depends(get_db)):
    meeting = svc.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return [ParticipantOut.model_validate(p) for p in svc.list_active_participants(db, meeting_id)]
