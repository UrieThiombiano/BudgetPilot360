"""
Dashboard principal (Phase 5.1) — agrégation budgétaire de l'entreprise.

Tout est DÉRIVÉ des dépenses, comme le consommé des catégories : aucun compteur
matérialisé, donc aucune dérive possible entre le dashboard et le reste de l'app.

Trois requêtes scopées company_id (company, catégories, dépenses) puis agrégation
en un seul passage Python — largement suffisant à l'échelle PME. Si le volume
explose un jour, la même agrégation basculera dans une fonction SQL (RPC) sans
changer le contrat de l'endpoint.

Conventions temporelles :
- « consommé » = somme des dépenses APPROUVÉES de l'année civile en cours
  (le budget annuel est un budget d'année civile) ;
- les dépenses en attente sont comptées quelle que soit leur date : elles
  appellent une action de l'admin ;
- l'évolution mensuelle couvre les 12 derniers mois, mois courant inclus,
  dépenses approuvées uniquement.
"""

from datetime import date

from fastapi import HTTPException, status

from app.core.supabase_client import get_service_client

TREND_MONTHS = 12
TOP_CATEGORIES_LIMIT = 5


def _today() -> date:
    """Isolé pour être monkeypatchable en test (agrégats déterministes)."""
    return date.today()


def _last_month_keys(today: date, n: int) -> list[str]:
    """Les n derniers mois au format AAAA-MM, du plus ancien au plus récent."""
    year, month = today.year, today.month
    keys: list[str] = []
    for _ in range(n):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(keys))


def get_summary(company_id: str, top_limit: int = TOP_CATEGORIES_LIMIT) -> dict:
    """Agrégats budgétaires de l'entreprise. `top_limit` borne les catégories
    retournées (le dashboard en affiche 5 ; l'assistant IA les veut toutes)."""
    today = _today()
    client = get_service_client()

    company_resp = (
        client.table("companies")
        .select("id, name, annual_budget")
        .eq("id", company_id)
        .execute()
    )
    if not company_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Entreprise introuvable."
        )
    company = company_resp.data[0]

    categories = (
        client.table("categories")
        .select("id, name, planned_budget")
        .eq("company_id", company_id)
        .execute()
    ).data or []

    expenses = (
        client.table("expenses")
        .select("amount, status, expense_date, category_id")
        .eq("company_id", company_id)
        .execute()
    ).data or []

    year_prefix = f"{today.year:04d}-"
    month_key = f"{today.year:04d}-{today.month:02d}"
    trend_keys = _last_month_keys(today, TREND_MONTHS)
    trend: dict[str, dict] = {k: {"total": 0.0, "count": 0} for k in trend_keys}

    consumed = 0.0
    month_total = 0.0
    expenses_count = 0
    pending_count = 0
    pending_amount = 0.0
    rejected_count = 0
    consumed_by_cat: dict[str, float] = {}

    for e in expenses:
        amount = float(e["amount"])
        expense_date = str(e.get("expense_date") or "")  # "AAAA-MM-JJ"
        in_year = expense_date.startswith(year_prefix)

        if e["status"] == "pending":
            pending_count += 1
            pending_amount += amount
        if in_year:
            expenses_count += 1
            if e["status"] == "rejected":
                rejected_count += 1
        if e["status"] == "approved":
            if in_year:
                consumed += amount
                cat_id = e.get("category_id")
                if cat_id:
                    consumed_by_cat[cat_id] = consumed_by_cat.get(cat_id, 0.0) + amount
                if expense_date.startswith(month_key):
                    month_total += amount
            point = trend.get(expense_date[:7])
            if point is not None:
                point["total"] += amount
                point["count"] += 1

    annual_budget = float(company.get("annual_budget") or 0)
    top_categories = sorted(
        (
            {
                "id": c["id"],
                "name": c["name"],
                "planned_budget": float(c["planned_budget"]),
                "consumed": round(consumed_by_cat.get(c["id"], 0.0), 2),
            }
            for c in categories
        ),
        key=lambda c: c["consumed"],
        reverse=True,
    )[:top_limit]

    return {
        "company_name": company["name"],
        "annual_budget": round(annual_budget, 2),
        "consumed": round(consumed, 2),
        "remaining": round(annual_budget - consumed, 2),
        "month_total": round(month_total, 2),
        "expenses_count": expenses_count,
        "pending_count": pending_count,
        "pending_amount": round(pending_amount, 2),
        "rejected_count": rejected_count,
        "monthly_trend": [
            {"month": k, "total": round(trend[k]["total"], 2), "count": trend[k]["count"]}
            for k in trend_keys
        ],
        "top_categories": top_categories,
    }
