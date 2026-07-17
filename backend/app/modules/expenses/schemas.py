from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ExpenseCreate(BaseModel):
    amount: float = Field(gt=0, le=99_999_999)
    category_id: str
    expense_date: date | None = None  # défaut : aujourd'hui (côté DB)
    description: str | None = Field(default=None, max_length=500)


class ExpenseOut(BaseModel):
    id: str
    amount: float
    expense_date: str
    description: str | None = None
    status: str  # pending / approved / rejected
    category_id: str
    category_name: str | None = None
    has_receipt: bool = False
    rejection_reason: str | None = None
    created_at: str | None = None


class ReceiptUrlOut(BaseModel):
    url: str
    expires_in: int


class PendingExpenseOut(BaseModel):
    id: str
    amount: float
    expense_date: str
    description: str | None = None
    category_id: str
    category_name: str | None = None
    author_id: str
    author_name: str | None = None
    has_receipt: bool = False
    created_at: str | None = None


class ReviewRequest(BaseModel):
    action: Literal["approve", "reject"]
    reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def reason_required_on_reject(self):
        if self.action == "reject" and not (self.reason or "").strip():
            raise ValueError("Le motif de rejet est obligatoire.")
        return self


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=1000)


class CommentOut(BaseModel):
    id: str
    user_id: str
    author_name: str | None = None
    content: str
    created_at: str | None = None
