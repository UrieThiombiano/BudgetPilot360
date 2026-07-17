from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Plan = Literal["starter", "standard", "premium"]


class RegistrationRequestCreate(BaseModel):
    """Formulaire public « Demander un compte » — n'entraîne AUCUNE création
    de tenant ni de compte : uniquement une demande à valider par Pukri."""

    company_name: str = Field(min_length=2, max_length=120)
    industry: str = Field(min_length=2, max_length=80)
    contact_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=6, max_length=30)
    city: str = Field(min_length=2, max_length=80)
    employees_count: int | None = Field(default=None, ge=1, le=100_000)
    message: str | None = Field(default=None, max_length=1000)


class RegistrationRequestOut(BaseModel):
    id: str
    company_name: str
    industry: str
    contact_name: str
    email: str
    phone: str
    city: str
    employees_count: int | None
    message: str | None
    status: Literal["pending", "approved", "rejected"]
    plan: str | None
    subscription_months: int | None
    internal_note: str | None
    rejection_reason: str | None
    company_id: str | None
    reviewed_at: str | None
    created_at: str | None


class RegistrationStats(BaseModel):
    pending: int
    approved: int
    rejected: int
    total: int
    new_today: int


class ReviewRegistrationRequest(BaseModel):
    action: Literal["approve", "reject"]
    # Requis à l'approbation (validés au router) :
    plan: Plan | None = None
    subscription_months: int | None = Field(default=None, ge=1, le=60)
    internal_note: str = Field(default="", max_length=1000)
    rejection_reason: str = Field(default="", max_length=500)
