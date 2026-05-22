from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    meeting_id: str
    participant_id: str
    sender_name: str
    content: str
    created_at: datetime
