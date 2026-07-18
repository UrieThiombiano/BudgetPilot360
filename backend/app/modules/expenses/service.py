"""
Dépenses — côté utilisateur.

La logique CRUD + workflow (création → pending → approbation → notification +
audit + alertes de seuil) est PARTAGÉE avec les recettes via
`app.core.transactions.TransactionService` (CLAUDE.md : ne jamais dupliquer).
Ce module ne fait que : (1) instancier le service avec le spec « dépense », et
(2) porter ce qui est propre aux dépenses — les commentaires.

Justificatifs : bucket privé `receipts`, chemin `{company_id}/{expense_id}/…`.
"""

from fastapi import HTTPException, UploadFile, status

from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client
from app.core.transactions import TransactionService, TxSpec
from app.modules.budgets import alerts

EXPENSE_SPEC = TxSpec(
    table="expenses",
    date_field="expense_date",
    proof_field="receipt_path",
    category_type="expense",
    kind="expense",
    noun="Dépense",
    approved_verb="approuvée",
    approved_body="Votre dépense a été approuvée. Le budget de la catégorie a été mis à jour.",
    proof_path_segment="",  # {company_id}/{expense_id}/…
    # Seule une approbation fait croître le consommé → contrôle des seuils ici.
    on_approved=lambda *, company_id, tx: alerts.check_after_approval(
        company_id=company_id, expense=tx
    ),
    link_notification=True,  # la notification pointe vers la dépense (colonne expense_id)
)

_service = TransactionService(EXPENSE_SPEC)


# --- Délégations au service partagé (contrat inchangé pour le router) ---

def create_expense(user: CurrentUser, payload) -> dict:
    return _service.create(user, payload)


def list_my_expenses(user: CurrentUser) -> list[dict]:
    return _service.list_mine(user)


def list_pending_expenses(user: CurrentUser) -> list[dict]:
    return _service.list_pending(user)


def review_expense(reviewer: CurrentUser, expense_id: str, action: str, reason: str | None) -> dict:
    return _service.review(reviewer, expense_id, action, reason)


async def upload_receipt(user: CurrentUser, expense_id: str, file: UploadFile) -> str:
    return await _service.upload_proof(user, expense_id, file)


def get_receipt_url(user: CurrentUser, expense_id: str) -> dict:
    return _service.get_proof_url(user, expense_id)


def _get_expense_for_member(user: CurrentUser, expense_id: str) -> dict:
    return _service.get_for_member(user, expense_id)


# --- Commentaires (propres aux dépenses) ---

def list_comments(user: CurrentUser, expense_id: str) -> list[dict]:
    _get_expense_for_member(user, expense_id)
    client = get_service_client()
    comments = (
        client.table("expense_comments")
        .select("id, user_id, content, created_at")
        .eq("expense_id", expense_id)
        .eq("company_id", user.company_id)
        .order("created_at")
        .execute()
    ).data or []

    profiles = (
        client.table("profiles")
        .select("id, full_name, email")
        .eq("company_id", user.company_id)
        .execute()
    ).data or []
    authors = {p["id"]: (p.get("full_name") or p.get("email")) for p in profiles}

    for c in comments:
        c["author_name"] = authors.get(c["user_id"])
    return comments


def add_comment(user: CurrentUser, expense_id: str, content: str) -> dict:
    _get_expense_for_member(user, expense_id)
    resp = (
        get_service_client()
        .table("expense_comments")
        .insert(
            {
                "expense_id": expense_id,
                "company_id": user.company_id,
                "user_id": user.id,
                "content": content.strip(),
            }
        )
        .execute()
    )
    comment = resp.data[0]
    comment["author_name"] = user.email
    return comment
