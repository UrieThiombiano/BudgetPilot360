from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str | None = None
    expense_id: str | None = None
    read: bool
    created_at: str | None = None


class UnreadCountOut(BaseModel):
    unread: int
