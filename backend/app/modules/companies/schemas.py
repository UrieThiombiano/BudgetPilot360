from pydantic import BaseModel, Field


class CompanyOut(BaseModel):
    id: str
    name: str
    annual_budget: float
    created_at: str | None = None


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    annual_budget: float | None = Field(default=None, ge=0)
