from fastapi import APIRouter, Depends, UploadFile

from app.core.security import CurrentUser, get_current_user
from app.modules.recurring import service as recurring
from app.modules.revenues import service
from app.modules.revenues.schemas import ReceiptUrlOut, RevenueCreate, RevenueOut

router = APIRouter()


def _revenue_out(r: dict) -> RevenueOut:
    return RevenueOut(
        id=r["id"],
        amount=float(r["amount"]),
        revenue_date=str(r["revenue_date"]),
        description=r.get("description"),
        source=r.get("source"),
        status=r["status"],
        category_id=r["category_id"],
        category_name=r.get("category_name"),
        has_proof=bool(r.get("proof_path")),
        rejection_reason=r.get("rejection_reason"),
        created_at=r.get("created_at"),
    )


@router.post("", response_model=RevenueOut, status_code=201)
async def create_revenue(
    payload: RevenueCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Enregistre une recette — confirmée immédiatement (pas d'approbation).
    Tout membre de l'entreprise."""
    return _revenue_out(service.create_revenue(user, payload))


@router.get("/mine", response_model=list[RevenueOut])
async def list_my_revenues(user: CurrentUser = Depends(get_current_user)):
    """Les recettes de l'utilisateur courant."""
    # Catch-up des transactions automatiques dues (best-effort, ne lève jamais).
    if user.company_id:
        recurring.materialize_due(user.company_id)
    return [_revenue_out(r) for r in service.list_my_revenues(user)]


@router.post("/{revenue_id}/proof", response_model=RevenueOut, status_code=201)
async def upload_proof(
    revenue_id: str,
    file: UploadFile,
    user: CurrentUser = Depends(get_current_user),
):
    """Joint un justificatif (PDF/PNG/JPEG/WebP, 10 Mo max) à SA recette en attente."""
    await service.upload_proof(user, revenue_id, file)
    mine = service.list_my_revenues(user)
    return _revenue_out(next(r for r in mine if r["id"] == revenue_id))


@router.get("/{revenue_id}/proof", response_model=ReceiptUrlOut)
async def get_proof_url(
    revenue_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """URL signée (10 min) du justificatif — auteur de la recette ou admin."""
    return service.get_proof_url(user, revenue_id)
