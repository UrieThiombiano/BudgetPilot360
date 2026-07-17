"""
Espace Super Admin / Pukri (Phase 10.1) — vue globale multi-entreprises.

SEUL module autorisé à requêter SANS scoping company_id : il est réservé au
rôle super_admin, vérifié explicitement côté FastAPI au niveau du router
(require_role("super_admin")) — la RLS (bypassée par le service_role) n'est
pas la barrière ici, le RBAC applicatif l'est.

Les actions d'abonnement sont auditées avec le company_id de l'entreprise
CIBLE, pour que l'historique apparaisse dans l'audit de cette entreprise.
"""

from fastapi import HTTPException, status

from app.core import audit
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client


def list_companies() -> list[dict]:
    client = get_service_client()
    companies = (
        client.table("companies")
        .select("id, name, created_at, subscription_status, plan, subscription_ends_at")
        .order("created_at", desc=True)
        .execute()
    ).data or []

    profiles = (client.table("profiles").select("company_id, role").execute()).data or []
    users_by_company: dict[str, int] = {}
    for p in profiles:
        if p.get("company_id") and p["role"] != "super_admin":
            users_by_company[p["company_id"]] = users_by_company.get(p["company_id"], 0) + 1

    return [
        {
            "id": c["id"],
            "name": c["name"],
            "created_at": c.get("created_at"),
            "subscription_status": c.get("subscription_status") or "active",
            "plan": c.get("plan") or "starter",
            "subscription_ends_at": c.get("subscription_ends_at"),
            "users_count": users_by_company.get(c["id"], 0),
        }
        for c in companies
    ]


def get_stats() -> dict:
    from datetime import date, timedelta

    from app.modules.registration import service as registration

    client = get_service_client()

    companies = (
        client.table("companies")
        .select("id, subscription_status, plan, subscription_ends_at")
        .execute()
    ).data or []
    active = sum(1 for c in companies if (c.get("subscription_status") or "active") == "active")

    horizon = (date.today() + timedelta(days=30)).isoformat()
    expiring_soon = sum(
        1
        for c in companies
        if c.get("subscription_ends_at") and str(c["subscription_ends_at"]) <= horizon
    )
    plans: dict[str, int] = {}
    for c in companies:
        plan = c.get("plan") or "starter"
        plans[plan] = plans.get(plan, 0) + 1

    profiles = (client.table("profiles").select("company_id, role").execute()).data or []
    users_count = sum(
        1 for p in profiles if p.get("company_id") and p["role"] != "super_admin"
    )

    expenses = (client.table("expenses").select("amount, status").execute()).data or []
    approved_amount = sum(float(e["amount"]) for e in expenses if e["status"] == "approved")

    registration_stats = registration.get_stats()

    return {
        "companies_count": len(companies),
        "active_companies": active,
        "suspended_companies": len(companies) - active,
        "users_count": users_count,
        "expenses_count": len(expenses),
        "approved_amount": round(approved_amount, 2),
        "pending_requests": registration_stats["pending"],
        "new_requests_today": registration_stats["new_today"],
        "expiring_soon": expiring_soon,
        "plans": plans,
    }


def set_subscription(actor: CurrentUser, company_id: str, action: str) -> dict:
    new_status = "active" if action == "activate" else "suspended"
    client = get_service_client()
    resp = (
        client.table("companies")
        .update({"subscription_status": new_status})
        .eq("id", company_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Entreprise introuvable."
        )
    company = resp.data[0]

    # Action sensible (gestion des abonnements) → audit, sur l'entreprise cible
    audit.log_action(
        company_id=company_id,
        actor_id=actor.id,
        action=f"subscription.{'activated' if new_status == 'active' else 'suspended'}",
        details={"company_name": company.get("name")},
    )
    return company
