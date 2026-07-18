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


class CategoryBreakdownEntry(BaseModel):
    id: str
    name: str
    planned: float  # budget prévu (dépense) ou objectif (recette)
    amount: float  # réalisé sur la période
    count: int  # nombre d'opérations (tooltips des donuts)


class KindBreakdown(BaseModel):
    year: list[CategoryBreakdownEntry]
    month: list[CategoryBreakdownEntry]


class CategoryBreakdowns(BaseModel):
    expenses: KindBreakdown
    revenues: KindBreakdown


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

    # --- Analytique par catégorie (donuts, budget vs réalisé) ---
    by_category: CategoryBreakdowns
    consumed_prev_year: float = 0  # dépenses approuvées N-1 (delta de tendance)
    revenue_prev_year: float = 0  # recettes confirmées N-1
