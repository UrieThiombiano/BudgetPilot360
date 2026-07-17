"""
Rapports (Phase 7.1) — collecte des données d'un rapport budgétaire de période.

RBAC : l'export est une capacité admin (tableau CLAUDE.md), vérifié au router.
Toutes les requêtes sont scopées company_id. La mise en forme (PDF/Excel) vit
dans pdf.py et excel.py ; ce module ne produit que des données.
"""

from datetime import date

from fastapi import HTTPException, status

from app.core.supabase_client import get_service_client

STATUS_LABELS = {
    "approved": "Approuvée",
    "pending": "En attente",
    "rejected": "Rejetée",
}


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
        .select("id, name, planned_budget")
        .eq("company_id", company_id)
        .execute()
    ).data or []

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

    cat_names = {c["id"]: c["name"] for c in categories}
    totals = {s: {"amount": 0.0, "count": 0} for s in STATUS_LABELS}
    consumed_by_cat: dict[str, float] = {}
    rows = []
    for e in expenses:
        amount = float(e["amount"])
        totals[e["status"]]["amount"] += amount
        totals[e["status"]]["count"] += 1
        if e["status"] == "approved":
            consumed_by_cat[e["category_id"]] = (
                consumed_by_cat.get(e["category_id"], 0.0) + amount
            )
        rows.append(
            {
                "expense_date": e["expense_date"],
                "category_name": cat_names.get(e["category_id"], "—"),
                "author_name": authors.get(e["user_id"], "—"),
                "description": e.get("description") or "",
                "amount": amount,
                "status": e["status"],
                "status_label": STATUS_LABELS[e["status"]],
            }
        )

    breakdown = sorted(
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
    for item in breakdown:
        item["ratio"] = (
            item["consumed"] / item["planned_budget"] if item["planned_budget"] > 0 else None
        )

    return {
        "company_name": company["name"],
        "annual_budget": float(company.get("annual_budget") or 0),
        "date_from": date_from,
        "date_to": date_to,
        "generated_on": date.today(),
        "total_approved": round(totals["approved"]["amount"], 2),
        "total_pending": round(totals["pending"]["amount"], 2),
        "total_rejected": round(totals["rejected"]["amount"], 2),
        "count_approved": totals["approved"]["count"],
        "count_pending": totals["pending"]["count"],
        "count_rejected": totals["rejected"]["count"],
        "expenses": rows,
        "breakdown": breakdown,
    }
