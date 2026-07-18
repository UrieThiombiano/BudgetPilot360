from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class MemberOut(BaseModel):
    id: str
    email: str | None = None
    full_name: str | None = None
    job_title: str | None = None
    role: str
    created_at: str | None = None


class CreateMemberRequest(BaseModel):
    """Invitation d'un collaborateur — AUCUN mot de passe : l'admin ne le
    connaît jamais, l'utilisateur le choisit lui-même via le lien d'activation.
    La fonction est OBLIGATOIRE : elle sert de libellé de rôle dans l'équipe."""

    email: EmailStr
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    job_title: str = Field(min_length=2, max_length=80)


class SetMemberRoleRequest(BaseModel):
    """Nomination (`admin`) ou révocation (`user`) d'un admin adjoint."""

    role: Literal["admin", "user"]


class TeamOut(BaseModel):
    members: list[MemberOut]
    # Administrateur principal (companies.owner_id) — seul habilité à nommer
    # ou révoquer l'admin adjoint. Null tant que la migration 010 n'est pas passée.
    owner_id: str | None = None
    user_count: int
    max_users: int
    can_add_user: bool
