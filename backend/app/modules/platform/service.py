"""
Espace Super Admin / Pukri (Phase 10.1, enrichi « analyst ») — vue globale
multi-entreprises.

SEUL module autorisé à requêter SANS scoping company_id : il est réservé au
rôle super_admin, vérifié explicitement côté FastAPI au niveau du router
(require_role("super_admin")) — la RLS (bypassée par le service_role) n'est
pas la barrière ici, le RBAC applicatif l'est.

PRINCIPE DE CONFIANCE MULTI-TENANT : Pukri ne voit JAMAIS le détail financier
des clients — uniquement des agrégats (dernière activité, sièges occupés,
volume d'appels IA, canaux d'acquisition). Aucune dépense individuelle,
aucun budget par catégorie ne transite par ce module.

Les actions d'abonnement sont auditées avec le company_id de l'entreprise
CIBLE, pour que l'historique apparaisse dans l'audit de cette entreprise.
"""

from datetime import date, timedelta

from fastapi import HTTPException, status

from app.core import audit
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client
from app.modules.team.service import MAX_USERS_PER_COMPANY


def _month_start_iso() -> str:
    today = date.today()
    return f"{today.year:04d}-{today.month:02d}-01T00:00:00+00:00"


def _ai_calls_by_company(client) -> dict[str, int]:
    """Appels IA du mois en cours par entreprise — dérivés de l'audit
    (`ai.asked`, déjà tracé à chaque question) : zéro table nouvelle, et un
    vrai suivi du coût API Mistral par client."""
    rows = (
        client.table("audit_logs")
        .select("company_id")
        .eq("action", "ai.asked")
        .gte("created_at", _month_start_iso())
        .execute()
    ).data or []
    counts: dict[str, int] = {}
    for r in rows:
        cid = r.get("company_id")
        if cid:
            counts[cid] = counts.get(cid, 0) + 1
    return counts


def _last_activity_by_company(client) -> dict[str, str]:
    """Dernière activité métier (dépense OU recette créée) par entreprise —
    le signal de churn le plus fiable : une entreprise silencieuse 30 jours
    est à rappeler."""
    latest: dict[str, str] = {}
    for table in ("expenses", "revenues"):
        rows = (
            client.table(table).select("company_id, created_at").execute()
        ).data or []
        for r in rows:
            cid, ts = r.get("company_id"), r.get("created_at")
            if cid and ts and (cid not in latest or str(ts) > latest[cid]):
                latest[cid] = str(ts)
    return latest


def list_companies() -> list[dict]:
    client = get_service_client()
    companies = (
        client.table("companies")
        .select("id, name, created_at, subscription_status, plan, subscription_ends_at, owner_id")
        .order("created_at", desc=True)
        .execute()
    ).data or []

    profiles = (
        client.table("profiles").select("id, company_id, role, removed_at").execute()
    ).data or []
    users_by_company: dict[str, int] = {}
    seats_by_company: dict[str, int] = {}
    owners = {c["id"]: c.get("owner_id") for c in companies}
    for p in profiles:
        cid = p.get("company_id")
        if not cid or p["role"] == "super_admin":
            continue
        users_by_company[cid] = users_by_company.get(cid, 0) + 1
        # Sièges = collaborateurs ACTIFS (users + adjoint), hors propriétaire —
        # même définition que la limite de licence (team.count_collaborators).
        if p.get("removed_at") is None and p["id"] != owners.get(cid):
            seats_by_company[cid] = seats_by_company.get(cid, 0) + 1

    ai_calls = _ai_calls_by_company(client)
    last_activity = _last_activity_by_company(client)

    return [
        {
            "id": c["id"],
            "name": c["name"],
            "created_at": c.get("created_at"),
            "subscription_status": c.get("subscription_status") or "active",
            "plan": c.get("plan") or "starter",
            "subscription_ends_at": c.get("subscription_ends_at"),
            "users_count": users_by_company.get(c["id"], 0),
            "seats_used": seats_by_company.get(c["id"], 0),
            "max_seats": MAX_USERS_PER_COMPANY,
            "ai_calls_month": ai_calls.get(c["id"], 0),
            "last_activity": last_activity.get(c["id"]),
        }
        for c in companies
    ]


def get_stats() -> dict:
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

    # Canaux d'acquisition déclarés sur les demandes de compte
    referral_rows = (
        client.table("registration_requests").select("referral_source").execute()
    ).data or []
    referral_sources: dict[str, int] = {}
    for r in referral_rows:
        source = (r.get("referral_source") or "").strip() or "Non renseigné"
        referral_sources[source] = referral_sources.get(source, 0) + 1

    ai_calls_month = sum(_ai_calls_by_company(client).values())

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
        "ai_calls_month": ai_calls_month,
        "referral_sources": referral_sources,
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
