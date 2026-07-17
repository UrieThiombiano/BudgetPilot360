from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import CurrentUser, require_role
from app.modules.registration import service
from app.modules.registration.schemas import (
    RegistrationRequestCreate,
    RegistrationRequestOut,
    RegistrationStats,
    ReviewRegistrationRequest,
)

router = APIRouter()

super_admin_only = require_role("super_admin")


@router.post("/requests", status_code=201)
async def submit_request(payload: RegistrationRequestCreate):
    """PUBLIC — dépôt d'une demande d'inscription d'entreprise.

    Règle d'architecture fondamentale : aucun tenant ni compte n'est créé ici.
    La demande reste `pending` jusqu'à validation explicite du super_admin.
    """
    created = service.submit_request(payload)
    return {"id": created["id"], "status": created["status"]}


@router.get("/requests", response_model=list[RegistrationRequestOut])
async def list_requests(
    status_filter: str | None = Query(default=None, alias="status"),
    user: CurrentUser = Depends(super_admin_only),
):
    """Demandes d'inscription (super_admin), les plus récentes d'abord."""
    return service.list_requests(status_filter)


@router.get("/stats", response_model=RegistrationStats)
async def get_stats(user: CurrentUser = Depends(super_admin_only)):
    """Compteurs des demandes (en attente, validées, refusées, du jour)."""
    return service.get_stats()


@router.post("/requests/{request_id}/review", response_model=RegistrationRequestOut)
async def review_request(
    request_id: str,
    payload: ReviewRegistrationRequest,
    user: CurrentUser = Depends(super_admin_only),
):
    """Approuve (création du tenant + invitation de l'Organization Owner) ou
    refuse une demande. Approbation = offre + durée d'abonnement obligatoires."""
    if payload.action == "approve":
        if not payload.plan or not payload.subscription_months:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="L'approbation exige une offre (plan) et une durée d'abonnement.",
            )
        return service.approve_request(
            actor=user,
            request_id=request_id,
            plan=payload.plan,
            subscription_months=payload.subscription_months,
            internal_note=payload.internal_note,
        )
    return service.reject_request(
        actor=user,
        request_id=request_id,
        reason=payload.rejection_reason,
        internal_note=payload.internal_note,
    )
