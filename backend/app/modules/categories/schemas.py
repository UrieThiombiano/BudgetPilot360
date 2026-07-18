from typing import Literal

from pydantic import BaseModel, Field

CategoryType = Literal["expense", "revenue"]


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    planned_budget: float = Field(default=0, ge=0)
    # 'expense' = poste de dépense (budget prévu) ; 'revenue' = poste de recette
    # (objectif de recettes). Défaut expense pour rester rétro-compatible.
    type: CategoryType = "expense"


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    planned_budget: float | None = Field(default=None, ge=0)
    # Le type n'est pas modifiable : changer le type d'une catégorie qui porte
    # déjà des transactions n'aurait pas de sens.


class CategoryOut(BaseModel):
    id: str
    name: str
    type: CategoryType = "expense"
    planned_budget: float  # budget de dépense prévu OU objectif de recettes
    consumed: float  # dépenses approuvées OU recettes confirmées de la catégorie
    created_at: str | None = None
