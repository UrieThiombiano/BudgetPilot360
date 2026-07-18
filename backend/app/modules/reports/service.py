"""
Rapports — collecte des données d'un rapport budgétaire de période.

Depuis l'ajout des recettes, le rapport présente TROIS blocs : Recettes,
Dépenses, Bénéfice (net + marge). RBAC : l'export est une capacité admin
(CLAUDE.md), vérifié au router. Toutes les requêtes sont scopées company_id.
La mise en forme (PDF/Excel) vit dans pdf.py et excel.py ; ce module ne produit
que des données.
"""

from datetime import date

from fastapi import HTTPException, status

from app.core.supabase_client import get_service_client

STATUS_LABELS = {
    "approved": "Approuvée",
    "pending": "En attente",
    "rejected": "Rejetée",
}
# Les recettes « approved » sont dites « confirmées » (entrée d'argent validée).
REVENUE_STATUS_LABELS = {
    "approved": "Confirmée",
    "pending": "En attente",
    "rejected": "Rejetée",
}


def _collect(rows, cat_names, authors, status_labels, *, date_field, with_source=False):
    """Agrège une liste de transactions en totaux par statut + lignes détaillées."""
    totals = {s: {"amount": 0.0, "count": 0} for s in status_labels}
    consumed_by_cat: dict[str, float] = {}
    detail = []
    for r in rows:
        amount = float(r["amount"])
        totals[r["status"]]["amount"] += amount
        totals[r["status"]]["count"] += 1
        if r["status"] == "approved":
            consumed_by_cat[r["category_id"]] = (
                consumed_by_cat.get(r["category_id"], 0.0) + amount
            )
        row = {
            "date": r[date_field],
            "category_name": cat_names.get(r["category_id"], "—"),
            "author_name": authors.get(r["user_id"], "—"),
            "description": r.get("description") or "",
            "amount": amount,
            "status": r["status"],
            "status_label": status_labels[r["status"]],
        }
        if with_source:
            row["source"] = r.get("source") or ""
        detail.append(row)
    return totals, consumed_by_cat, detail


def _breakdown(categories, consumed_by_cat):
    result = sorted(
        (
            {
                "name": c["name"],
                "planned_budget": float(c["planned_budget"]),
                "consumed": round(consumed_by_cat.get(c["id"], 0.0), 2),
            }
            for c in categories
        ),
        key=lambda c: c["consumed"],
        reverse=True,
    )
    for item in result:
        item["ratio"] = (
            item["consumed"] / item["planned_budget"] if item["planned_budget"] > 0 else None
        )
    return result


def get_report_data(company_id: str, date_from: date, date_to: date) -> dict:
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
    cat_names = {c["id"]: c["name"] for c in categories}
    expense_cats = [c for c in categories if (c.get("type") or "expense") == "expense"]
    revenue_cats = [c for c in categories if c.get("type") == "revenue"]

    profiles = (
        client.table("profiles")
        .select("id, full_name, email")
        .eq("company_id", company_id)
        .execute()
    ).data or []
    authors = {p["id"]: (p.get("full_name") or p.get("email")) for p in profiles}

    expenses = (
        client.table("expenses")
        .select("id, amount, expense_date, description, status, category_id, user_id")
        .eq("company_id", company_id)
        .gte("expense_date", date_from.isoformat())
        .lte("expense_date", date_to.isoformat())
        .order("expense_date")
        .execute()
    ).data or []

    revenues = (
        client.table("revenues")
        .select("id, amount, revenue_date, description, status, category_id, user_id, source")
        .eq("company_id", company_id)
        .gte("revenue_date", date_from.isoformat())
        .lte("revenue_date", date_to.isoformat())
        .order("revenue_date")
        .execute()
    ).data or []

    exp_totals, exp_consumed, exp_rows = _collect(
        expenses, cat_names, authors, STATUS_LABELS, date_field="expense_date"
    )
    rev_totals, rev_consumed, rev_rows = _collect(
        revenues, cat_names, authors, REVENUE_STATUS_LABELS,
        date_field="revenue_date", with_source=True,
    )

    total_expense = round(exp_totals["approved"]["amount"], 2)
    total_revenue = round(rev_totals["approved"]["amount"], 2)
    net_profit = round(total_revenue - total_expense, 2)
    margin = round(net_profit / total_revenue * 100, 1) if total_revenue > 0 else None

    return {
        "company_name": company["name"],
        "annual_budget": float(company.get("annual_budget") or 0),
        "date_from": date_from,
        "date_to": date_to,
        "generated_on": date.today(),
        # --- Dépenses ---
        "total_approved": total_expense,
        "total_pending": round(exp_totals["pending"]["amount"], 2),
        "total_rejected": round(exp_totals["rejected"]["amount"], 2),
        "count_approved": exp_totals["approved"]["count"],
        "count_pending": exp_totals["pending"]["count"],
        "count_rejected": exp_totals["rejected"]["count"],
        "expenses": exp_rows,
        "breakdown": _breakdown(expense_cats, exp_consumed),
        # --- Recettes ---
        "total_revenue": total_revenue,
        "total_revenue_pending": round(rev_totals["pending"]["amount"], 2),
        "count_revenue_approved": rev_totals["approved"]["count"],
        "count_revenue_pending": rev_totals["pending"]["count"],
        "count_revenue_rejected": rev_totals["rejected"]["count"],
        "revenues": rev_rows,
        "revenue_breakdown": _breakdown(revenue_cats, rev_consumed),
        # --- Bénéfice ---
        "net_profit": net_profit,
        "margin": margin,
    }
