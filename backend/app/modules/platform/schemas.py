from typing import Literal

from pydantic import BaseModel


class PlatformCompany(BaseModel):
    id: str
    name: str
    created_at: str | None
    subscription_status: Literal["active", "suspended"]
    plan: str = "starter"
    subscription_ends_at: str | None = None
    users_count: int  # membres hors super_admin
    seats_used: int = 0  # collaborateurs actifs (users + adjoint), hors propriétaire
    max_seats: int = 3
    ai_calls_month: int = 0  # appels IA du mois en cours (coût API par client)
    last_activity: str | None = None  # dernière dépense/recette créée (signal churn)


class PlatformStats(BaseModel):
    companies_count: int
    active_companies: int
    suspended_companies: int
    users_count: int  # profils rattachés à une entreprise (admin + user)
    expenses_count: int  # toutes dépenses, tous statuts, toute la plateforme
    approved_amount: float  # volume total traité (dépenses approuvées)
    pending_requests: int  # demandes d'inscription en attente
    new_requests_today: int
    expiring_soon: int  # abonnements expirant sous 30 jours
    plans: dict[str, int]  # répartition des entreprises par offre
    ai_calls_month: int = 0  # total plateforme des appels IA du mois
    referral_sources: dict[str, int] = {}  # canaux d'acquisition déclarés


class SubscriptionAction(BaseModel):
    action: Literal["activate", "suspend"]
