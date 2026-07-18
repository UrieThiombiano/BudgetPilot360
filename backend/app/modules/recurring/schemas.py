from pydantic import BaseModel, Field


class RecurringCreate(BaseModel):
    """Automatisation d'une dépense mensuelle (licence, abonnement, loyer…).

    `day_of_month` : jour du décompte (1–31, borné au dernier jour des mois
    courts — « chaque 31 » vaut le 28/29 en février).
    `months_total` : nombre de mois avant l'arrêt automatique.
    """

    category_id: str
    amount: float = Field(gt=0)
    description: str = Field(min_length=2, max_length=200)
    day_of_month: int = Field(ge=1, le=31)
    months_total: int = Field(ge=1, le=120)
    active: bool = True


class RecurringUpdate(BaseModel):
    """Modification partielle : montant, libellé, jour, ou pause/reprise."""

    amount: float | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, min_length=2, max_length=200)
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    active: bool | None = None


class RecurringOut(BaseModel):
    id: str
    category_id: str
    category_name: str | None = None
    amount: float
    description: str
    day_of_month: int
    months_total: int
    months_done: int
    active: bool
    next_due: str
    created_at: str | None = None
