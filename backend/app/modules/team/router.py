from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, require_role
from app.modules.team import service
from app.modules.team.schemas import CreateMemberRequest, MemberOut, TeamOut

router = APIRouter()


@router.get("/members", response_model=TeamOut)
async def get_team(user: CurrentUser = Depends(require_role("admin", "super_admin"))):
    """Liste les membres de l'entreprise + état de la limite d'utilisateurs."""
    members = service.list_members(user.company_id)
    user_count = sum(1 for m in members if m["role"] == "user")
    return TeamOut(
        members=[MemberOut(**m) for m in members],
        user_count=user_count,
        max_users=service.MAX_USERS_PER_COMPANY,
        can_add_user=user_count < service.MAX_USERS_PER_COMPANY,
    )


@router.post("/members", response_model=MemberOut, status_code=201)
async def invite_member(
    payload: CreateMemberRequest,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Invite un collaborateur (rôle `user`) dans l'entreprise de l'admin courant.

    Aucun mot de passe ne transite : le collaborateur reçoit un email
    d'activation et choisit lui-même son mot de passe (imputabilité).
    Refusé (409 + message explicite) au-delà de 3 utilisateurs.
    """
    profile = service.invite_member(
        admin=user,
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        job_title=payload.job_title,
    )
    return MemberOut(**profile)
