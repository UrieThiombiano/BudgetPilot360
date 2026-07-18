"""
Cœur générique des transactions métier — dépenses ET recettes.

Dépenses et recettes suivent EXACTEMENT le même patron : création (statut
`pending`) → approbation/confirmation par un admin → notification de l'auteur +
audit. Plutôt que de dupliquer cette logique (CLAUDE.md : ne jamais dupliquer),
une `TransactionService` est paramétrée par un `TxSpec` (table, champ de date,
champ justificatif, type de catégorie, libellés). Les modules `expenses` et
`revenues` en instancient chacun une.

Toutes les écritures passent par le backend, scopées `company_id` ; la RLS
Postgres reste le filet de sécurité (defense in depth). Justificatifs : bucket
privé `receipts`, chemin préfixé `company_id/` (isolation tenant).
"""

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable

from fastapi import HTTPException, UploadFile, status

from app.core import audit
from app.core.money import fcfa
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client
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


@dataclass(frozen=True)
class TxSpec:
    """Décrit une famille de transactions (dépense ou recette)."""

    table: str  # "expenses" | "revenues"
    date_field: str  # "expense_date" | "revenue_date"
    proof_field: str  # "receipt_path" | "proof_path"
    category_type: str  # "expense" | "revenue" (la catégorie doit être de ce type)
    kind: str  # "expense" | "revenue" — préfixe audit/notif
    noun: str  # "Dépense" | "Recette" — libellé des notifications
    approved_verb: str  # "approuvée" | "confirmée"
    approved_body: str  # corps de la notification d'approbation
    # Statut à la création : 'pending' pour une dépense (attend une approbation),
    # 'approved' pour une recette (pas d'approbation — comptée immédiatement).
    initial_status: str = "pending"
    # Statuts pour lesquels le justificatif reste modifiable (une recette étant
    # créée déjà confirmée, l'auteur doit pouvoir y joindre son justificatif).
    proof_editable_statuses: tuple[str, ...] = ("pending",)
    # Champs supplémentaires propres à la famille (ex : ("source",) pour les recettes)
    extra_fields: tuple[str, ...] = ()
    # Segment de chemin dans le bucket : "" → {cid}/{id}/… ; "revenues" → {cid}/revenues/{id}/…
    proof_path_segment: str = ""
    # Hook appelé après une approbation réussie (alertes de seuil — dépenses only)
    on_approved: Callable[..., None] | None = None
    # Lie la notification à la transaction (colonne expense_id) — dépenses only
    link_notification: bool = False


class TransactionService:
    """Logique CRUD + workflow partagée entre dépenses et recettes."""

    def __init__(self, spec: TxSpec) -> None:
        self.spec = spec

    # --- Catégorie ---
    def _get_category(self, company_id: str, category_id: str) -> dict:
        resp = (
            get_service_client()
            .table("categories")
            .select("id, name, type")
            .eq("id", category_id)
            .eq("company_id", company_id)
            .execute()
        )
        if not resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Catégorie introuvable dans votre entreprise.",
            )
        category = resp.data[0]
        # La catégorie doit être du bon type (une dépense sur une catégorie de
        # recette, ou l'inverse, n'a pas de sens). Tolérant si `type` absent.
        cat_type = category.get("type")
        if cat_type is not None and cat_type != self.spec.category_type:
            expected = "recette" if self.spec.category_type == "revenue" else "dépense"
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cette catégorie n'est pas une catégorie de {expected}.",
            )
        return category

    def _select_fields(self, *, include_user: bool) -> str:
        cols = ["id", "amount", self.spec.date_field, "description", "status",
                "category_id", self.spec.proof_field, "rejection_reason", "created_at"]
        if include_user:
            cols.append("user_id")
        cols.extend(self.spec.extra_fields)
        return ", ".join(cols)

    # --- Création (statut pending) ---
    def create(self, user: CurrentUser, payload) -> dict:
        category = self._get_category(user.company_id, payload.category_id)

        record = {
            "company_id": user.company_id,
            "category_id": payload.category_id,
            "user_id": user.id,
            "amount": payload.amount,
            "description": payload.description,
            "status": self.spec.initial_status,
        }
        date_value = getattr(payload, self.spec.date_field, None)
        if date_value is not None:
            record[self.spec.date_field] = date_value.isoformat()
        for extra in self.spec.extra_fields:
            record[extra] = getattr(payload, extra, None)

        resp = get_service_client().table(self.spec.table).insert(record).execute()
        created = resp.data[0]
        created["category_name"] = category["name"]
        return created

    # --- Mes transactions ---
    def list_mine(self, user: CurrentUser) -> list[dict]:
        client = get_service_client()
        rows = (
            client.table(self.spec.table)
            .select(self._select_fields(include_user=False))
            .eq("company_id", user.company_id)
            .eq("user_id", user.id)
            .order(self.spec.date_field, desc=True)
            .execute()
        ).data or []

        names = self._category_names(client, user.company_id)
        for r in rows:
            r["category_name"] = names.get(r["category_id"])
        return rows

    # --- Transactions en attente (admin) ---
    def list_pending(self, user: CurrentUser) -> list[dict]:
        client = get_service_client()
        rows = (
            client.table(self.spec.table)
            .select(self._select_fields(include_user=True))
            .eq("company_id", user.company_id)
            .eq("status", "pending")
            .order("created_at")
            .execute()
        ).data or []

        names = self._category_names(client, user.company_id)
        authors = self._author_names(client, user.company_id)
        return [
            {
                **r,
                "category_name": names.get(r["category_id"]),
                "author_id": r["user_id"],
                "author_name": authors.get(r["user_id"]),
                "has_proof": bool(r.get(self.spec.proof_field)),
            }
            for r in rows
        ]

    @staticmethod
    def _category_names(client, company_id: str) -> dict:
        cats = (
            client.table("categories")
            .select("id, name")
            .eq("company_id", company_id)
            .execute()
        ).data or []
        return {c["id"]: c["name"] for c in cats}

    @staticmethod
    def _author_names(client, company_id: str) -> dict:
        profiles = (
            client.table("profiles")
            .select("id, full_name, email")
            .eq("company_id", company_id)
            .execute()
        ).data or []
        return {p["id"]: (p.get("full_name") or p.get("email")) for p in profiles}

    # --- Approbation / confirmation ou rejet ---
    def review(self, reviewer: CurrentUser, tx_id: str, action: str, reason: str | None) -> dict:
        new_status = "approved" if action == "approve" else "rejected"
        fields = {
            "status": new_status,
            "reviewed_by": reviewer.id,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "rejection_reason": (reason or "").strip() or None if new_status == "rejected" else None,
        }

        client = get_service_client()
        resp = (
            client.table(self.spec.table)
            .update(fields)
            .eq("id", tx_id)
            .eq("company_id", reviewer.company_id)
            .eq("status", "pending")  # transition atomique : jamais deux revues
            .execute()
        )
        if not resp.data:
            noun = self.spec.noun.lower()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{self.spec.noun} introuvable ou déjà traitée.",
            )
        tx = resp.data[0]

        audit.log_action(
            company_id=reviewer.company_id,
            actor_id=reviewer.id,
            action=f"{self.spec.kind}.{new_status}",
            details={"id": tx_id, "amount": str(tx["amount"]), "reason": fields["rejection_reason"]},
        )

        amount = float(tx["amount"])
        if new_status == "approved":
            title = f"{self.spec.noun} de {fcfa(amount)} {self.spec.approved_verb}"
            body = self.spec.approved_body
        else:
            title = f"{self.spec.noun} de {fcfa(amount)} rejetée"
            body = f"Motif : {fields['rejection_reason']}"
        notifications.notify(
            company_id=reviewer.company_id,
            user_id=tx["user_id"],
            type_=f"{self.spec.kind}_{new_status}",
            title=title,
            body=body,
            expense_id=tx_id if self.spec.link_notification else None,
        )

        if new_status == "approved" and self.spec.on_approved is not None:
            self.spec.on_approved(company_id=reviewer.company_id, tx=tx)

        return tx

    # --- Accès à une transaction (auteur ou admin) ---
    def get_for_member(self, user: CurrentUser, tx_id: str) -> dict:
        resp = (
            get_service_client()
            .table(self.spec.table)
            .select(f"id, user_id, company_id, status, {self.spec.proof_field}")
            .eq("id", tx_id)
            .eq("company_id", user.company_id)
            .execute()
        )
        if not resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{self.spec.noun} introuvable.",
            )
        tx = resp.data[0]
        is_owner = tx["user_id"] == user.id
        is_admin = user.role in ("admin", "super_admin")
        if not (is_owner or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Vous n'avez pas accès à cette {self.spec.noun.lower()}.",
            )
        return tx

    # --- Justificatif ---
    async def upload_proof(self, user: CurrentUser, tx_id: str, file: UploadFile) -> str:
        tx = self.get_for_member(user, tx_id)
        if tx["user_id"] != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Seul l'auteur peut joindre un justificatif.",
            )
        if tx["status"] not in self.spec.proof_editable_statuses:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Le justificatif ne peut plus être modifié.",
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
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Fichier vide."
            )

        base = re.sub(r"[^a-zA-Z0-9._-]", "_", file.filename or "justificatif")[:80]
        ext = ALLOWED_RECEIPT_TYPES[content_type]
        prefix = f"{user.company_id}/"
        if self.spec.proof_path_segment:
            prefix += f"{self.spec.proof_path_segment}/"
        path = f"{prefix}{tx_id}/{uuid.uuid4().hex[:8]}_{base}{'' if base.lower().endswith(ext) else ext}"

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

        client.table(self.spec.table).update({self.spec.proof_field: path}).eq(
            "id", tx_id
        ).execute()
        return path

    def get_proof_url(self, user: CurrentUser, tx_id: str) -> dict:
        tx = self.get_for_member(user, tx_id)
        if not tx.get(self.spec.proof_field):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucun justificatif.")

        try:
            resp = (
                get_service_client()
                .storage.from_(RECEIPTS_BUCKET)
                .create_signed_url(tx[self.spec.proof_field], SIGNED_URL_TTL_SECONDS)
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
