from fastapi import APIRouter, Depends, UploadFile

from app.core.security import CurrentUser, get_current_user, require_role
from app.modules.expenses import service
from app.modules.expenses.schemas import (
    CommentCreate,
    CommentOut,
    ExpenseCreate,
    ExpenseOut,
    PendingExpenseOut,
    ReceiptUrlOut,
    ReviewRequest,
)

router = APIRouter()


def _expense_out(e: dict) -> ExpenseOut:
    return ExpenseOut(
        id=e["id"],
        amount=float(e["amount"]),
        expense_date=str(e["expense_date"]),
        description=e.get("description"),
        status=e["status"],
        category_id=e["category_id"],
        category_name=e.get("category_name"),
        has_receipt=bool(e.get("receipt_path")),
        rejection_reason=e.get("rejection_reason"),
        created_at=e.get("created_at"),
    )


@router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense(
    payload: ExpenseCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Crée une dépense (statut `pending`). Tout membre de l'entreprise."""
    return _expense_out(service.create_expense(user, payload))


@router.get("/mine", response_model=list[ExpenseOut])
async def list_my_expenses(user: CurrentUser = Depends(get_current_user)):
    """Les dépenses de l'utilisateur courant, avec leur statut."""
    return [_expense_out(e) for e in service.list_my_expenses(user)]


@router.get("/pending", response_model=list[PendingExpenseOut])
async def list_pending_expenses(
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Toutes les dépenses en attente de l'entreprise — écran d'approbation admin."""
    return [
        PendingExpenseOut(
            id=e["id"],
            amount=float(e["amount"]),
            expense_date=str(e["expense_date"]),
            description=e.get("description"),
            category_id=e["category_id"],
            category_name=e.get("category_name"),
            author_id=e["author_id"],
            author_name=e.get("author_name"),
            has_receipt=e["has_proof"],
            created_at=e.get("created_at"),
        )
        for e in service.list_pending_expenses(user)
    ]


@router.post("/{expense_id}/review", response_model=ExpenseOut)
async def review_expense(
    expense_id: str,
    payload: ReviewRequest,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Approuve ou rejette une dépense en attente (motif obligatoire au rejet).

    À l'approbation, le consommé de la catégorie est mis à jour (dérivé des
    dépenses approuvées) et l'auteur est notifié. Action auditée.
    """
    expense = service.review_expense(user, expense_id, payload.action, payload.reason)
    return _expense_out(expense)


@router.post("/{expense_id}/receipt", response_model=ExpenseOut, status_code=201)
async def upload_receipt(
    expense_id: str,
    file: UploadFile,
    user: CurrentUser = Depends(get_current_user),
):
    """Joint un justificatif (PDF/PNG/JPEG/WebP, 10 Mo max) à SA dépense en attente."""
    await service.upload_receipt(user, expense_id, file)
    mine = service.list_my_expenses(user)
    return _expense_out(next(e for e in mine if e["id"] == expense_id))


@router.get("/{expense_id}/receipt", response_model=ReceiptUrlOut)
async def get_receipt_url(
    expense_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """URL signée (10 min) du justificatif — auteur de la dépense ou admin."""
    return service.get_receipt_url(user, expense_id)


@router.get("/{expense_id}/comments", response_model=list[CommentOut])
async def list_comments(
    expense_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    return service.list_comments(user, expense_id)


@router.post("/{expense_id}/comments", response_model=CommentOut, status_code=201)
async def add_comment(
    expense_id: str,
    payload: CommentCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Commente une dépense — auteur de la dépense ou admin de l'entreprise."""
    return service.add_comment(user, expense_id, payload.content)
