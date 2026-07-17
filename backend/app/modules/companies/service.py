"""
Entreprise courante (lecture / mise à jour du budget annuel).

Note d'architecture : l'auto-création d'entreprise (onboarding self-service)
a été SUPPRIMÉE — les tenants naissent exclusivement dans le module
`registration`, après validation d'une demande par le super_admin Pukri.
"""

from fastapi import HTTPException, status

from app.core import audit
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client


def get_company(company_id: str) -> dict:
    resp = (
        get_service_client()
        .table("companies")
        .select("id, name, annual_budget, created_at")
        .eq("id", company_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entreprise introuvable.")
    return resp.data[0]


def update_company(user: CurrentUser, fields: dict) -> dict:
    if not fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Aucun champ à modifier.",
        )
    if "name" in fields:
        fields["name"] = fields["name"].strip()

    resp = (
        get_service_client()
        .table("companies")
        .update(fields)
        .eq("id", user.company_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entreprise introuvable.")

    # Audit obligatoire : la modification de budget est une action sensible (CLAUDE.md)
    audit.log_action(
        company_id=user.company_id,
        actor_id=user.id,
        action="company.budget_updated" if "annual_budget" in fields else "company.updated",
        details={"fields": fields},
    )
    return resp.data[0]
