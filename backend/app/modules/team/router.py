from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, require_role
from app.modules.team import service
from app.modules.team.schemas import (
    CreateMemberRequest,
    MemberOut,
    SetMemberRoleRequest,
    TeamOut,
)

router = APIRouter()


@router.get("/members", response_model=TeamOut)
async def get_team(user: CurrentUser = Depends(require_role("admin", "super_admin"))):
    """Liste les membres de l'entreprise + état de la limite de collaborateurs.

    `owner_id` identifie l'administrateur principal (seul habilité à nommer un
    adjoint). La limite de 3 compte les `user` ET l'adjoint (il garde son siège).
    """
    owner_id = service.get_owner_id(user.company_id)
    members = service.list_members(user.company_id)
    if owner_id is None:
        collab_count = sum(1 for m in members if m["role"] == "user")
    else:
        collab_count = sum(
            1 for m in members if m["role"] in ("user", "admin") and m["id"] != owner_id
        )
    return TeamOut(
        members=[MemberOut(**m) for m in members],
        owner_id=owner_id,
        user_count=collab_count,
        max_users=service.MAX_USERS_PER_COMPANY,
        can_add_user=collab_count < service.MAX_USERS_PER_COMPANY,
    )


@router.post("/members", response_model=MemberOut, status_code=201)
async def invite_member(
    payload: CreateMemberRequest,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Invite un collaborateur (rôle `user`) dans l'entreprise de l'admin courant.

    Aucun mot de passe ne transite : le collaborateur reçoit un email
    d'activation et choisit lui-même son mot de passe (imputabilité).
    La fonction est obligatoire (libellé de rôle affiché dans l'équipe).
    Refusé (409 + message explicite) au-delà de 3 collaborateurs.
    """
    profile = service.invite_member(
        admin=user,
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        job_title=payload.job_title,
    )
    return MemberOut(**profile)


@router.patch("/members/{member_id}/role", response_model=MemberOut)
async def set_member_role(
    member_id: str,
    payload: SetMemberRoleRequest,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Nomme un admin adjoint (`user` → `admin`) ou révoque ce rôle (`admin` → `user`).

    Réservé à l'administrateur principal (companies.owner_id) — pensé pour les
    co-fondateurs. Un seul adjoint par entreprise ; il garde son siège dans la
    limite des 3 collaborateurs.
    """
    profile = service.set_member_role(
        actor=user, member_id=member_id, new_role=payload.role
    )
    return MemberOut(**profile)


@router.delete("/members/{member_id}", status_code=204)
async def remove_member(
    member_id: str,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Retire (désactive) un utilisateur de l'entreprise.

    Accès révoqué + slot libéré, mais l'historique de dépenses est conservé
    (imputabilité — on ne supprime jamais le profil). Refusé si la cible
    n'est pas un `user` (révoquer l'adjoint d'abord), appartient à une autre
    entreprise, ou est l'appelant.
    """
    service.remove_member(admin=user, member_id=member_id)
    return None
