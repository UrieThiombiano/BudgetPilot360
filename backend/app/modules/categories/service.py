"""
Catégories de dépenses (postes budgétaires).

RBAC : lecture pour tous les membres de l'entreprise, écritures admin uniquement
(vérifié au niveau du router). Toutes les requêtes sont scopées company_id —
le service_role bypass la RLS, le scoping applicatif fait donc autorité ici.

Le "consommé" d'une catégorie = somme des dépenses APPROUVÉES (statut approved).
Les dépenses pending/rejected n'entament pas le budget.
"""

from fastapi import HTTPException, status

from app.core import audit
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client


def list_categories(company_id: str) -> list[dict]:
    client = get_service_client()
    cats = (
        client.table("categories")
        .select("id, name, planned_budget, created_at")
        .eq("company_id", company_id)
        .order("created_at")
        .execute()
    ).data or []

    approved = (
        client.table("expenses")
        .select("category_id, amount")
        .eq("company_id", company_id)
        .eq("status", "approved")
        .execute()
    ).data or []

    consumed_by_cat: dict[str, float] = {}
    for exp in approved:
        cat_id = exp["category_id"]
        consumed_by_cat[cat_id] = consumed_by_cat.get(cat_id, 0.0) + float(exp["amount"])

    return [
        {
            "id": c["id"],
            "name": c["name"],
            "planned_budget": float(c["planned_budget"]),
            "consumed": round(consumed_by_cat.get(c["id"], 0.0), 2),
            "created_at": c["created_at"],
        }
        for c in cats
    ]


def _is_duplicate_name(exc: Exception) -> bool:
    text = str(exc)
    return "23505" in text or "duplicate" in text.lower()


def create_category(user: CurrentUser, name: str, planned_budget: float) -> dict:
    client = get_service_client()
    try:
        resp = (
            client.table("categories")
            .insert(
                {
                    "company_id": user.company_id,
                    "name": name.strip(),
                    "planned_budget": planned_budget,
                }
            )
            .execute()
        )
    except Exception as exc:
        if _is_duplicate_name(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Une catégorie porte déjà ce nom.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Échec de la création de la catégorie.",
        ) from exc

    created = resp.data[0]
    audit.log_action(
        company_id=user.company_id,
        actor_id=user.id,
        action="category.created",
        details={"category_id": created["id"], "name": created["name"], "planned_budget": planned_budget},
    )
    return created


def update_category(user: CurrentUser, category_id: str, fields: dict) -> dict:
    if not fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Aucun champ à modifier.",
        )
    if "name" in fields:
        fields["name"] = fields["name"].strip()

    client = get_service_client()
    try:
        resp = (
            client.table("categories")
            .update(fields)
            .eq("id", category_id)
            .eq("company_id", user.company_id)  # jamais de modification hors tenant
            .execute()
        )
    except Exception as exc:
        if _is_duplicate_name(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Une catégorie porte déjà ce nom.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Échec de la modification de la catégorie.",
        ) from exc

    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Catégorie introuvable.",
        )

    audit.log_action(
        company_id=user.company_id,
        actor_id=user.id,
        action="category.updated",
        details={"category_id": category_id, "fields": fields},
    )
    return resp.data[0]


def delete_category(user: CurrentUser, category_id: str) -> None:
    client = get_service_client()
    try:
        resp = (
            client.table("categories")
            .delete()
            .eq("id", category_id)
            .eq("company_id", user.company_id)
            .execute()
        )
    except Exception as exc:
        # FK expenses.category_id on delete RESTRICT → 23503 si des dépenses existent
        if "23503" in str(exc) or "foreign key" in str(exc).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer : des dépenses sont rattachées à cette catégorie.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Échec de la suppression de la catégorie.",
        ) from exc

    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Catégorie introuvable.",
        )

    audit.log_action(
        company_id=user.company_id,
        actor_id=user.id,
        action="category.deleted",
        details={"category_id": category_id, "name": resp.data[0].get("name")},
    )
