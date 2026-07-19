from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, require_role
from app.modules.platform import service
from app.modules.platform.schemas import (
    PlatformCompany,
    PlatformStats,
    SubscriptionAction,
)

router = APIRouter()

# Vérification EXPLICITE du rôle super_admin côté FastAPI (exigence CLAUDE.md),
# en plus du bypass RLS du service_role : le RBAC applicatif fait autorité.
super_admin_only = require_role("super_admin")


@router.get("/companies", response_model=list[PlatformCompany])
async def list_companies(user: CurrentUser = Depends(super_admin_only)):
    """Toutes les entreprises clientes (nom, création, abonnement, utilisateurs)."""
    return service.list_companies()


@router.get("/stats", response_model=PlatformStats)
async def get_stats(user: CurrentUser = Depends(super_admin_only)):
    """Statistiques globales de la plateforme."""
    return service.get_stats()


@router.post("/companies/{company_id}/subscription", response_model=PlatformCompany)
async def set_subscription(
    company_id: str,
    payload: SubscriptionAction,
    user: CurrentUser = Depends(super_admin_only),
):
    """Active ou suspend l'abonnement d'une entreprise cliente (audité)."""
    company = service.set_subscription(user, company_id, payload.action)
    # users_count n'est pas recalculé ici : le front invalide la liste complète.
    return PlatformCompany(
        id=company["id"],
        name=company["name"],
        created_at=company.get("created_at"),
        subscription_status=company["subscription_status"],
        users_count=0,
    )


@router.delete("/companies/{company_id}", status_code=204)
async def delete_company(
    company_id: str,
    user: CurrentUser = Depends(super_admin_only),
):
    """Supprime DÉFINITIVEMENT une entreprise cliente : données métier, profils,
    comptes Auth, justificatifs. Irréversible — l'UI exige la saisie du nom."""
    service.delete_company(user, company_id)
    return None
