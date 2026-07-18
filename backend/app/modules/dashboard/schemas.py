from pydantic import BaseModel


class MonthlyPoint(BaseModel):
    month: str  # "AAAA-MM"
    total: float
    count: int


class ComparisonPoint(BaseModel):
    month: str  # "AAAA-MM"
    revenues: float  # recettes confirmées du mois
    expenses: float  # dépenses approuvées du mois
    net: float  # revenues - expenses


class TopCategory(BaseModel):
    id: str
    name: str
    planned_budget: float
    consumed: float


class DashboardSummary(BaseModel):
    company_name: str
    annual_budget: float
    consumed: float  # dépenses approuvées de l'année civile en cours
    remaining: float  # annual_budget - consumed (peut être négatif : dépassement)
    month_total: float  # dépenses approuvées du mois en cours
    expenses_count: int  # toutes dépenses de l'année, tous statuts
    pending_count: int  # dépenses en attente, sans borne de date
    pending_amount: float
    rejected_count: int  # dépenses rejetées de l'année

    # --- Recettes & bénéfice (recettes/dépenses au statut approved uniquement) ---
    revenue_month: float  # recettes confirmées du mois en cours
    revenue_year: float  # recettes confirmées de l'année en cours
    net_profit: float  # revenue_year - consumed (bénéfice net de l'année ; signe = santé)
    margin: float | None  # net_profit / revenue_year en % (None si aucune recette)
    revenue_pending_count: int  # recettes en attente de confirmation

    monthly_trend: list[MonthlyPoint]  # 12 derniers mois, dépenses approuvées
    comparison: list[ComparisonPoint]  # 12 derniers mois : recettes vs dépenses + net
    top_categories: list[TopCategory]  # top 5 par consommé de l'année (dépenses)
