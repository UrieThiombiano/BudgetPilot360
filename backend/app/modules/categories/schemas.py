from pydantic import BaseModel, Field


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    planned_budget: float = Field(default=0, ge=0)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    planned_budget: float | None = Field(default=None, ge=0)


class CategoryOut(BaseModel):
    id: str
    name: str
    planned_budget: float
    consumed: float  # somme des dépenses approuvées de la catégorie
    created_at: str | None = None
