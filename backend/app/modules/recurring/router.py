"""
Endpoints des automatisations mensuelles — un router par famille, générés par
la même factory (dépenses : /recurring-expenses ; recettes : /recurring-revenues).

ADMIN uniquement (adjoint compris — il porte le rôle `admin`) : les users ne
voient jamais les automatisations, ils saisissent uniquement leurs transactions.
"""

from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, require_role
from app.modules.recurring.schemas import RecurringCreate, RecurringOut, RecurringUpdate
from app.modules.recurring.service import RecurringService, expenses_service, revenues_service


def build_router(svc: RecurringService) -> APIRouter:
    router = APIRouter()

    @router.post("", response_model=RecurringOut, status_code=201)
    async def create_recurring(
        payload: RecurringCreate,
        user: CurrentUser = Depends(require_role("admin", "super_admin")),
    ):
        """Automatise une transaction mensuelle — ADMIN uniquement.

        Chaque échéance génère une dépense À VALIDER (workflow standard
        d'approbation) ou une recette confirmée, puis l'automatisation
        s'arrête d'elle-même après `months_total` échéances.
        """
        return RecurringOut(**svc.create(admin=user, payload=payload))

    @router.get("", response_model=list[RecurringOut])
    async def list_recurring(user: CurrentUser = Depends(require_role("admin", "super_admin"))):
        """Les automatisations de l'entreprise (échéances dues matérialisées d'abord)."""
        return [RecurringOut(**r) for r in svc.list(admin=user)]

    @router.patch("/{recurring_id}", response_model=RecurringOut)
    async def update_recurring(
        recurring_id: str,
        payload: RecurringUpdate,
        user: CurrentUser = Depends(require_role("admin", "super_admin")),
    ):
        """Modifie montant/libellé/jour, ou met en pause / reprend l'automatisation."""
        return RecurringOut(**svc.update(admin=user, recurring_id=recurring_id, payload=payload))

    @router.delete("/{recurring_id}", status_code=204)
    async def delete_recurring(
        recurring_id: str,
        user: CurrentUser = Depends(require_role("admin", "super_admin")),
    ):
        """Supprime l'automatisation — les transactions déjà générées restent."""
        svc.delete(admin=user, recurring_id=recurring_id)
        return None

    return router


router = build_router(expenses_service)  # /recurring-expenses
revenues_router = build_router(revenues_service)  # /recurring-revenues
