"""
Dépenses — côté utilisateur (Phase 3.1).

Workflow métier central : création → statut `pending` → approbation admin (Phase 3.2).
Toutes les écritures passent par ce backend (jamais frontend → Supabase en direct),
scopées company_id ; la RLS Postgres reste le filet de sécurité.

Justificatifs : bucket Supabase Storage privé `receipts`, chemin
`{company_id}/{expense_id}/{fichier}` — le préfixe company_id isole les tenants.
Seul le backend (service_role) lit/écrit le bucket ; le frontend passe par des
URLs signées à durée limitée.
"""

import re
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile, status

from app.core import audit
from app.core.money import fcfa
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client
from app.modules.budgets import alerts
from app.modules.notifications import service as notifications

RECEIPTS_BUCKET = "receipts"
MAX_RECEIPT_BYTES = 10 * 1024 * 1024  # 10 Mo
ALLOWED_RECEIPT_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
SIGNED_URL_TTL_SECONDS = 600


def _get_category(company_id: str, category_id: str) -> dict:
    resp = (
        get_service_client()
        .table("categories")
        .select("id, name")
        .eq("id", category_id)
        .eq("company_id", company_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Catégorie introuvable dans votre entreprise.",
        )
    return resp.data[0]


def create_expense(user: CurrentUser, payload) -> dict:
    category = _get_category(user.company_id, payload.category_id)

    record = {
        "company_id": user.company_id,
        "category_id": payload.category_id,
        "user_id": user.id,
        "amount": payload.amount,
        "description": payload.description,
        "status": "pending",
    }
    if payload.expense_date is not None:
        record["expense_date"] = payload.expense_date.isoformat()

    resp = get_service_client().table("expenses").insert(record).execute()
    created = resp.data[0]
    created["category_name"] = category["name"]
    return created


def list_my_expenses(user: CurrentUser) -> list[dict]:
    client = get_service_client()
    expenses = (
        client.table("expenses")
        .select("id, amount, expense_date, description, status, category_id, receipt_path, rejection_reason, created_at")
        .eq("company_id", user.company_id)
        .eq("user_id", user.id)
        .order("expense_date", desc=True)
        .execute()
    ).data or []

    categories = (
        client.table("categories")
        .select("id, name")
        .eq("company_id", user.company_id)
        .execute()
    ).data or []
    names = {c["id"]: c["name"] for c in categories}

    for e in expenses:
        e["category_name"] = names.get(e["category_id"])
    return expenses


def list_pending_expenses(user: CurrentUser) -> list[dict]:
    """Toutes les dépenses `pending` de l'entreprise, pour l'écran d'approbation admin."""
    client = get_service_client()
    expenses = (
        client.table("expenses")
        .select("id, amount, expense_date, description, category_id, user_id, receipt_path, created_at")
        .eq("company_id", user.company_id)
        .eq("status", "pending")
        .order("created_at")
        .execute()
    ).data or []

    categories = (
        client.table("categories").select("id, name").eq("company_id", user.company_id).execute()
    ).data or []
    cat_names = {c["id"]: c["name"] for c in categories}

    profiles = (
        client.table("profiles").select("id, full_name, email").eq("company_id", user.company_id).execute()
    ).data or []
    authors = {p["id"]: (p.get("full_name") or p.get("email")) for p in profiles}

    return [
        {
            **e,
            "category_name": cat_names.get(e["category_id"]),
            "author_id": e["user_id"],
            "author_name": authors.get(e["user_id"]),
            "has_receipt": bool(e.get("receipt_path")),
        }
        for e in expenses
    ]


def review_expense(reviewer: CurrentUser, expense_id: str, action: str, reason: str | None) -> dict:
    """Approuve ou rejette une dépense `pending` — le cœur du workflow métier.

    La transition est protégée contre les doubles revues concurrentes : l'UPDATE
    est conditionné à `status = 'pending'` ; zéro ligne touchée → déjà revue (409).
    Le "consommé" des catégories étant dérivé des dépenses approuvées, le budget
    et les dashboards se mettent à jour automatiquement à l'approbation.
    """
    new_status = "approved" if action == "approve" else "rejected"
    fields = {
        "status": new_status,
        "reviewed_by": reviewer.id,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "rejection_reason": (reason or "").strip() or None if new_status == "rejected" else None,
    }

    client = get_service_client()
    resp = (
        client.table("expenses")
        .update(fields)
        .eq("id", expense_id)
        .eq("company_id", reviewer.company_id)
        .eq("status", "pending")  # transition atomique : jamais deux revues
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dépense introuvable ou déjà traitée.",
        )
    expense = resp.data[0]

    # Audit obligatoire (CLAUDE.md) : approbation/rejet de dépense
    audit.log_action(
        company_id=reviewer.company_id,
        actor_id=reviewer.id,
        action=f"expense.{new_status}",
        details={"expense_id": expense_id, "amount": str(expense["amount"]), "reason": fields["rejection_reason"]},
    )

    # Notification au créateur de la dépense (workflow central du produit)
    amount = float(expense["amount"])
    if new_status == "approved":
        title = f"Dépense de {fcfa(amount)} approuvée"
        body = "Votre dépense a été approuvée. Le budget de la catégorie a été mis à jour."
    else:
        title = f"Dépense de {fcfa(amount)} rejetée"
        body = f"Motif : {fields['rejection_reason']}"
    notifications.notify(
        company_id=reviewer.company_id,
        user_id=expense["user_id"],
        type_=f"expense_{new_status}",
        title=title,
        body=body,
        expense_id=expense_id,
    )

    # Alertes de seuil budgétaire (Phase 6.1) : seule une approbation fait
    # croître le consommé, donc le contrôle ne s'exécute que dans ce cas.
    if new_status == "approved":
        alerts.check_after_approval(company_id=reviewer.company_id, expense=expense)

    return expense


def _get_expense_for_member(user: CurrentUser, expense_id: str) -> dict:
    """Récupère une dépense de l'entreprise : le propriétaire ou un admin y accède."""
    resp = (
        get_service_client()
        .table("expenses")
        .select("id, user_id, company_id, status, receipt_path")
        .eq("id", expense_id)
        .eq("company_id", user.company_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dépense introuvable.")
    expense = resp.data[0]
    is_owner = expense["user_id"] == user.id
    is_admin = user.role in ("admin", "super_admin")
    if not (is_owner or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas accès à cette dépense.",
        )
    return expense


async def upload_receipt(user: CurrentUser, expense_id: str, file: UploadFile) -> str:
    expense = _get_expense_for_member(user, expense_id)
    if expense["user_id"] != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul l'auteur de la dépense peut joindre un justificatif.",
        )
    if expense["status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le justificatif ne peut être modifié que tant que la dépense est en attente.",
        )

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_RECEIPT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Format accepté : PDF, PNG, JPEG ou WebP.",
        )

    data = await file.read()
    if len(data) > MAX_RECEIPT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Justificatif trop volumineux (10 Mo maximum).",
        )
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Fichier vide.",
        )

    # Nom de fichier neutralisé + unique ; le chemin commence par company_id (isolation tenant)
    base = re.sub(r"[^a-zA-Z0-9._-]", "_", file.filename or "justificatif")[:80]
    path = f"{user.company_id}/{expense_id}/{uuid.uuid4().hex[:8]}_{base}{'' if base.lower().endswith(ALLOWED_RECEIPT_TYPES[content_type]) else ALLOWED_RECEIPT_TYPES[content_type]}"

    client = get_service_client()
    try:
        client.storage.from_(RECEIPTS_BUCKET).upload(
            path, data, {"content-type": content_type}
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Échec de l'envoi du justificatif.",
        ) from exc

    client.table("expenses").update({"receipt_path": path}).eq("id", expense_id).execute()
    return path


def get_receipt_url(user: CurrentUser, expense_id: str) -> dict:
    expense = _get_expense_for_member(user, expense_id)
    if not expense.get("receipt_path"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucun justificatif.")

    try:
        resp = (
            get_service_client()
            .storage.from_(RECEIPTS_BUCKET)
            .create_signed_url(expense["receipt_path"], SIGNED_URL_TTL_SECONDS)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Impossible de générer le lien du justificatif.",
        ) from exc

    url = resp.get("signedURL") or resp.get("signedUrl") or resp.get("signed_url")
    if not url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Lien invalide.")
    return {"url": url, "expires_in": SIGNED_URL_TTL_SECONDS}


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
