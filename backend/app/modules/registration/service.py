"""
Demandes d'inscription des entreprises (RegistrationRequest).

DÉCISION D'ARCHITECTURE FONDAMENTALE (CLAUDE.md) : le formulaire public ne
crée JAMAIS de tenant ni de compte — seulement une demande `pending`. La
création effective de l'entreprise n'a lieu qu'à la validation explicite du
super_admin Pukri :

    RegistrationRequest → Validation Pukri → Company (tenant) + invitation
    de l'Organization Owner (admin), qui choisit lui-même son mot de passe
    via le lien d'activation (personne d'autre ne le connaît jamais).

L'approbation est compensée en cas d'échec partiel : company supprimée si
l'invitation échoue, compte supprimé si le rattachement du profil échoue —
jamais de tenant orphelin.
"""

import logging
from datetime import date, datetime, timezone

from fastapi import HTTPException, status

from app.core import audit
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client
from app.modules.team.service import _activation_redirect_url, classify_invite_error

logger = logging.getLogger(__name__)


def _add_months(start: date, months: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    # borne au dernier jour du mois cible (ex : 31 janv. + 1 mois → 28/29 févr.)
    last_day = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return date(year, month, min(start.day, last_day))


def submit_request(payload) -> dict:
    """Dépôt public d'une demande — aucun tenant, aucun compte, statut pending."""
    client = get_service_client()

    existing = (
        client.table("registration_requests")
        .select("id")
        .eq("email", payload.email)
        .eq("status", "pending")
        .execute()
    ).data or []
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une demande est déjà en cours d'examen pour cet email — l'équipe Pukri vous recontactera.",
        )

    resp = (
        client.table("registration_requests")
        .insert(
            {
                "company_name": payload.company_name.strip(),
                "industry": payload.industry.strip(),
                "contact_name": payload.contact_name.strip(),
                "job_title": payload.job_title.strip(),
                "email": payload.email,
                "phone": payload.phone.strip(),
                "city": payload.city.strip(),
                "employees_count": payload.employees_count,
                "referral_source": (payload.referral_source or "").strip() or None,
                "message": (payload.message or "").strip() or None,
                "status": "pending",
            }
        )
        .execute()
    )
    return resp.data[0]


def list_requests(status_filter: str | None = None) -> list[dict]:
    client = get_service_client()
    query = (
        client.table("registration_requests")
        .select("*")
        .order("created_at", desc=True)
    )
    if status_filter:
        query = query.eq("status", status_filter)
    return query.execute().data or []


def get_stats() -> dict:
    rows = (
        get_service_client()
        .table("registration_requests")
        .select("status, created_at")
        .execute()
    ).data or []
    today_prefix = date.today().isoformat()
    counts = {"pending": 0, "approved": 0, "rejected": 0}
    new_today = 0
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
        if str(r.get("created_at") or "").startswith(today_prefix):
            new_today += 1
    return {**counts, "total": len(rows), "new_today": new_today}


def _get_pending_request(client, request_id: str) -> dict:
    resp = (
        client.table("registration_requests")
        .select("*")
        .eq("id", request_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")
    request = resp.data[0]
    if request["status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette demande a déjà été traitée.",
        )
    return request


def reject_request(actor: CurrentUser, request_id: str, reason: str, internal_note: str) -> dict:
    client = get_service_client()
    _get_pending_request(client, request_id)

    resp = (
        client.table("registration_requests")
        .update(
            {
                "status": "rejected",
                "rejection_reason": reason.strip() or None,
                "internal_note": internal_note.strip() or None,
                "reviewed_by": actor.id,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", request_id)
        .eq("status", "pending")  # anti double-revue
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Demande déjà traitée.")
    # Aucun tenant créé : la demande reste simplement archivée.
    # (Email de notification au demandeur : à brancher quand le SMTP custom sera en place.)
    return resp.data[0]


def approve_request(
    actor: CurrentUser,
    request_id: str,
    plan: str,
    subscription_months: int,
    internal_note: str,
) -> dict:
    """Validation Pukri : c'est ICI (et seulement ici) que le tenant naît."""
    client = get_service_client()
    request = _get_pending_request(client, request_id)

    # 1) Création du tenant, avec offre et échéance d'abonnement
    company_resp = (
        client.table("companies")
        .insert(
            {
                "name": request["company_name"],
                "plan": plan,
                "subscription_status": "active",
                "subscription_ends_at": _add_months(
                    date.today(), subscription_months
                ).isoformat(),
            }
        )
        .execute()
    )
    company = company_resp.data[0]

    # 2) Invitation de l'Organization Owner : compte créé avec un secret interne
    #    aléatoire, email d'activation envoyé — il choisit lui-même son mot de
    #    passe (le super_admin ne le connaît jamais).
    try:
        invited = client.auth.admin.invite_user_by_email(
            request["email"],
            {
                "data": {
                    "full_name": request["contact_name"],
                    "job_title": request.get("job_title") or "",
                },
                "redirect_to": _activation_redirect_url(),
            },
        )
    except Exception as exc:
        # Compensation : pas de tenant orphelin si l'invitation échoue.
        client.table("companies").delete().eq("id", company["id"]).execute()
        logger.warning("Invitation owner échouée pour %s : %s", request["email"], exc)
        code, detail = classify_invite_error(exc)
        raise HTTPException(status_code=code, detail=detail) from exc

    owner_id = str(invited.user.id)

    # 3) Rattachement du profil : Organization Owner = rôle admin du tenant,
    #    et PROPRIÉTAIRE de l'entreprise (companies.owner_id) — seul habilité
    #    à nommer un admin adjoint (sql/010).
    try:
        client.table("profiles").upsert(
            {
                "id": owner_id,
                "email": request["email"],
                "full_name": request["contact_name"],
                "job_title": request.get("job_title") or None,
                "company_id": company["id"],
                "role": "admin",
            }
        ).execute()
        client.table("companies").update({"owner_id": owner_id}).eq(
            "id", company["id"]
        ).execute()
    except Exception as exc:
        client.auth.admin.delete_user(owner_id)
        client.table("companies").delete().eq("id", company["id"]).execute()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Échec du rattachement du responsable — approbation annulée.",
        ) from exc

    # 4) La demande devient approuvée et pointe vers le tenant créé
    updated = (
        client.table("registration_requests")
        .update(
            {
                "status": "approved",
                "plan": plan,
                "subscription_months": subscription_months,
                "internal_note": internal_note.strip() or None,
                "company_id": company["id"],
                "reviewed_by": actor.id,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", request_id)
        .eq("status", "pending")
        .execute()
    )
    if not updated.data:
        # double-revue concurrente : on compense tout
        client.auth.admin.delete_user(owner_id)
        client.table("companies").delete().eq("id", company["id"]).execute()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Demande déjà traitée.")

    audit.log_action(
        company_id=company["id"],
        actor_id=actor.id,
        action="registration.approved",
        details={"request_id": request_id, "plan": plan, "months": subscription_months},
    )
    return updated.data[0]
