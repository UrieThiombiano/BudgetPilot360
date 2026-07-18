from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, require_role
from app.modules.recurring import service
from app.modules.recurring.schemas import RecurringCreate, RecurringOut, RecurringUpdate

router = APIRouter()


@router.post("", response_model=RecurringOut, status_code=201)
async def create_recurring(
    payload: RecurringCreate,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Automatise une dépense mensuelle (licence, abonnement…) — ADMIN uniquement.

    Chaque échéance crée une dépense directement approuvée (aucune validation),
    puis l'automatisation s'arrête d'elle-même après `months_total` décomptes.
    """
    return RecurringOut(**service.create_recurring(admin=user, payload=payload))


@router.get("", response_model=list[RecurringOut])
async def list_recurring(user: CurrentUser = Depends(require_role("admin", "super_admin"))):
    """Les automatisations de l'entreprise (échéances dues matérialisées d'abord)."""
    return [RecurringOut(**r) for r in service.list_recurring(admin=user)]


@router.patch("/{recurring_id}", response_model=RecurringOut)
async def update_recurring(
    recurring_id: str,
    payload: RecurringUpdate,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Modifie montant/libellé/jour, ou met en pause / reprend le décompte."""
    return RecurringOut(
        **service.update_recurring(admin=user, recurring_id=recurring_id, payload=payload)
    )


@router.delete("/{recurring_id}", status_code=204)
async def delete_recurring(
    recurring_id: str,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Supprime l'automatisation — les dépenses déjà décomptées restent."""
    service.delete_recurring(admin=user, recurring_id=recurring_id)
    return None
