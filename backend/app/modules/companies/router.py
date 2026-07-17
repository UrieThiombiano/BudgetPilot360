from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import CurrentUser, get_current_user, require_role
from app.modules.companies import service
from app.modules.companies.schemas import CompanyOut, CompanyUpdate

router = APIRouter()


def _company_out(row: dict) -> CompanyOut:
    return CompanyOut(
        id=row["id"],
        name=row["name"],
        annual_budget=float(row["annual_budget"]),
        created_at=row.get("created_at"),
    )


@router.get("/me", response_model=CompanyOut)
async def get_my_company(user: CurrentUser = Depends(get_current_user)):
    """Entreprise de l'utilisateur courant (nom, budget annuel). Tous les membres."""
    if not user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucune entreprise.")
    return _company_out(service.get_company(user.company_id))


@router.patch("/me", response_model=CompanyOut)
async def update_my_company(
    payload: CompanyUpdate,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Met à jour le nom et/ou le budget annuel. Admin uniquement, audité."""
    fields = payload.model_dump(exclude_none=True)
    return _company_out(service.update_company(user, fields))


# POST /companies/onboard a été SUPPRIMÉ (décision d'architecture) : les
# entreprises ne s'auto-créent plus. Voir le module `registration` —
# RegistrationRequest → validation super_admin → création du tenant.
