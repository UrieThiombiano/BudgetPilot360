from pydantic import BaseModel


class MonthlyPoint(BaseModel):
    month: str  # "AAAA-MM"
    total: float
    count: int


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
    month_total: float  # approuvées du mois en cours
    expenses_count: int  # toutes dépenses de l'année, tous statuts
    pending_count: int  # en attente, sans borne de date (elles appellent une action)
    pending_amount: float
    rejected_count: int  # rejetées de l'année
    monthly_trend: list[MonthlyPoint]  # 12 derniers mois, approuvées, plus ancien d'abord
    top_categories: list[TopCategory]  # top 5 par consommé de l'année
