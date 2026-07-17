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
    connaît jamais, l'utilisateur le choisit lui-même via le lien d'activation."""

    email: EmailStr
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    job_title: str = Field(default="", max_length=80)


class TeamOut(BaseModel):
    members: list[MemberOut]
    user_count: int
    max_users: int
    can_add_user: bool
