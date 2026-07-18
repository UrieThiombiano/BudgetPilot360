from datetime import date

from pydantic import BaseModel, Field

# Le workflow de revue (approve/reject, motif obligatoire au rejet) et l'URL
# signée du justificatif sont identiques aux dépenses : on réutilise leurs
# schémas plutôt que de les redéfinir.
from app.modules.expenses.schemas import ReceiptUrlOut, ReviewRequest  # noqa: F401


class RevenueCreate(BaseModel):
    amount: float = Field(gt=0, le=99_999_999)
    category_id: str
    revenue_date: date | None = None  # défaut : aujourd'hui (côté DB)
    description: str | None = Field(default=None, max_length=500)
    source: str | None = Field(default=None, max_length=200)  # client / origine de la recette


class RevenueOut(BaseModel):
    id: str
    amount: float
    revenue_date: str
    description: str | None = None
    source: str | None = None
    status: str  # pending / approved (confirmée) / rejected
    category_id: str
    category_name: str | None = None
    has_proof: bool = False
    rejection_reason: str | None = None
    created_at: str | None = None


class PendingRevenueOut(BaseModel):
    id: str
    amount: float
    revenue_date: str
    description: str | None = None
    source: str | None = None
    category_id: str
    category_name: str | None = None
    author_id: str
    author_name: str | None = None
    has_proof: bool = False
    created_at: str | None = None
