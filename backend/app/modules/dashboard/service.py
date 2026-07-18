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
        .select("id, name, type, planned_budget")
        .eq("company_id", company_id)
        .execute()
    ).data or []

    expenses = (
        client.table("expenses")
        .select("amount, status, expense_date, category_id")
        .eq("company_id", company_id)
        .execute()
    ).data or []

    revenues = (
        client.table("revenues")
        .select("amount, status, revenue_date, category_id")
        .eq("company_id", company_id)
        .execute()
    ).data or []

    year_prefix = f"{today.year:04d}-"
    prev_year_prefix = f"{today.year - 1:04d}-"
    month_key = f"{today.year:04d}-{today.month:02d}"
    trend_keys = _last_month_keys(today, TREND_MONTHS)
    trend: dict[str, dict] = {k: {"total": 0.0, "count": 0} for k in trend_keys}
    revenue_trend: dict[str, float] = {k: 0.0 for k in trend_keys}

    consumed = 0.0
    month_total = 0.0
    consumed_prev_year = 0.0
    expenses_count = 0
    pending_count = 0
    pending_amount = 0.0
    rejected_count = 0
    consumed_by_cat: dict[str, float] = {}
    # Répartition par catégorie (année ET mois, avec nombre d'opérations) —
    # matière première des donuts / budget vs réalisé du dashboard analyste.
    exp_cat_year: dict[str, dict] = {}
    exp_cat_month: dict[str, dict] = {}
    rev_cat_year: dict[str, dict] = {}
    rev_cat_month: dict[str, dict] = {}

    def _bump(bucket: dict[str, dict], cat_id: str, amount: float) -> None:
        entry = bucket.setdefault(cat_id, {"amount": 0.0, "count": 0})
        entry["amount"] += amount
        entry["count"] += 1

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
            if expense_date.startswith(prev_year_prefix):
                consumed_prev_year += amount
            cat_id = e.get("category_id")
            if in_year:
                consumed += amount
                if cat_id:
                    consumed_by_cat[cat_id] = consumed_by_cat.get(cat_id, 0.0) + amount
                    _bump(exp_cat_year, cat_id, amount)
                if expense_date.startswith(month_key):
                    month_total += amount
                    if cat_id:
                        _bump(exp_cat_month, cat_id, amount)
            point = trend.get(expense_date[:7])
            if point is not None:
                point["total"] += amount
                point["count"] += 1

    # --- Recettes (confirmées = statut approved), même conventions temporelles ---
    revenue_year = 0.0
    revenue_month = 0.0
    revenue_prev_year = 0.0
    revenue_pending_count = 0
    for r in revenues:
        amount = float(r["amount"])
        revenue_date = str(r.get("revenue_date") or "")
        if r["status"] == "pending":
            revenue_pending_count += 1
        if r["status"] == "approved":
            if revenue_date.startswith(prev_year_prefix):
                revenue_prev_year += amount
            cat_id = r.get("category_id")
            if revenue_date.startswith(year_prefix):
                revenue_year += amount
                if cat_id:
                    _bump(rev_cat_year, cat_id, amount)
                if revenue_date.startswith(month_key):
                    revenue_month += amount
                    if cat_id:
                        _bump(rev_cat_month, cat_id, amount)
            if revenue_date[:7] in revenue_trend:
                revenue_trend[revenue_date[:7]] += amount

    net_profit = revenue_year - consumed
    margin = (net_profit / revenue_year * 100) if revenue_year > 0 else None

    annual_budget = float(company.get("annual_budget") or 0)
    expense_categories = [c for c in categories if (c.get("type") or "expense") == "expense"]
    revenue_categories = [c for c in categories if c.get("type") == "revenue"]
    top_categories = sorted(
        (
            {
                "id": c["id"],
                "name": c["name"],
                "planned_budget": float(c["planned_budget"]),
                "consumed": round(consumed_by_cat.get(c["id"], 0.0), 2),
            }
            for c in expense_categories
        ),
        key=lambda c: c["consumed"],
        reverse=True,
    )[:top_limit]

    def _breakdown(cats: list[dict], bucket: dict[str, dict]) -> list[dict]:
        """Répartition triée par montant décroissant — TOUTES les catégories du
        type (même à 0 : le budget vs réalisé doit montrer les postes non
        consommés), avec compteur d'opérations pour les tooltips."""
        rows = [
            {
                "id": c["id"],
                "name": c["name"],
                "planned": float(c["planned_budget"]),
                "amount": round(bucket.get(c["id"], {}).get("amount", 0.0), 2),
                "count": bucket.get(c["id"], {}).get("count", 0),
            }
            for c in cats
        ]
        return sorted(rows, key=lambda r: r["amount"], reverse=True)

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
        "revenue_month": round(revenue_month, 2),
        "revenue_year": round(revenue_year, 2),
        "net_profit": round(net_profit, 2),
        "margin": round(margin, 1) if margin is not None else None,
        "revenue_pending_count": revenue_pending_count,
        "monthly_trend": [
            {"month": k, "total": round(trend[k]["total"], 2), "count": trend[k]["count"]}
            for k in trend_keys
        ],
        "comparison": [
            {
                "month": k,
                "revenues": round(revenue_trend[k], 2),
                "expenses": round(trend[k]["total"], 2),
                "net": round(revenue_trend[k] - trend[k]["total"], 2),
            }
            for k in trend_keys
        ],
        "top_categories": top_categories,
        # --- Analytique par catégorie (donuts, budget vs réalisé) ---
        "by_category": {
            "expenses": {
                "year": _breakdown(expense_categories, exp_cat_year),
                "month": _breakdown(expense_categories, exp_cat_month),
            },
            "revenues": {
                "year": _breakdown(revenue_categories, rev_cat_year),
                "month": _breakdown(revenue_categories, rev_cat_month),
            },
        },
        # Totaux N-1 pour les indicateurs de tendance (delta annuel).
        "consumed_prev_year": round(consumed_prev_year, 2),
        "revenue_prev_year": round(revenue_prev_year, 2),
    }
