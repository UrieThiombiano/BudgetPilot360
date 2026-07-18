from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.security import CurrentUser, get_current_user, require_role
from app.modules.categories import service
from app.modules.categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter()


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    type: Literal["expense", "revenue"] | None = Query(
        default=None, description="Filtre par type : 'expense' ou 'revenue'"
    ),
    user: CurrentUser = Depends(get_current_user),
):
    """Liste des catégories (+ consommé). `type` filtre dépenses/recettes. Tous les membres."""
    return service.list_categories(user.company_id, type_filter=type)


@router.post("", response_model=CategoryOut, status_code=201)
async def create_category(
    payload: CategoryCreate,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    created = service.create_category(
        user, payload.name, payload.planned_budget, payload.type
    )
    return CategoryOut(
        id=created["id"],
        name=created["name"],
        type=created.get("type") or payload.type,
        planned_budget=float(created["planned_budget"]),
        consumed=0.0,
        created_at=created.get("created_at"),
    )


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: str,
    payload: CategoryUpdate,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    fields = payload.model_dump(exclude_none=True)
    updated = service.update_category(user, category_id, fields)
    # Le consommé n'est pas recalculé ici : le front rafraîchit la liste complète.
    return CategoryOut(
        id=updated["id"],
        name=updated["name"],
        type=updated.get("type") or "expense",
        planned_budget=float(updated["planned_budget"]),
        consumed=0.0,
        created_at=updated.get("created_at"),
    )


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: str,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    service.delete_category(user, category_id)
