"""
Exemple de module métier — sert de patron (pattern) à suivre pour les modules
categories / budgets / expenses / ai_assistant.

Chaque module = router.py (endpoints), schemas.py (Pydantic), service.py (logique métier).
Le RBAC est vérifié via `require_role(...)`, la RLS Postgres agit comme filet de sécurité.
"""

from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_current_user
from app.core.supabase_client import get_service_client

router = APIRouter()


@router.get("/me")
async def get_my_profile(user: CurrentUser = Depends(get_current_user)):
    """Retourne le profil applicatif de l'utilisateur courant (id, company_id, role)."""
    return {
        "id": user.id,
        "email": user.email,
        "company_id": user.company_id,
        "role": user.role,
    }


@router.get("/company/members")
async def list_company_members(user: CurrentUser = Depends(get_current_user)):
    """Liste les membres de l'entreprise de l'utilisateur courant.

    RBAC : accessible à tous les rôles de l'entreprise (admin ET user),
    la sensibilité est faible (juste des noms), mais reste scopé à company_id.
    """
    client = get_service_client()
    resp = (
        client.table("profiles")
        .select("id, full_name, role, created_at")
        .eq("company_id", user.company_id)
        .execute()
    )
    return resp.data
