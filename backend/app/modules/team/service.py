"""
Gestion d'équipe (admin uniquement).

Ajout d'un collaborateur = INVITATION, jamais un mot de passe choisi par
l'admin : sinon l'admin pourrait se connecter à la place du collaborateur et
aucune action ne serait imputable avec certitude. Le flux est donc :
1. `invite_user_by_email` (API Admin Supabase) crée le compte avec un secret
   interne aléatoire — jamais affiché à personne — et envoie l'email
   d'activation au collaborateur.
2. Le collaborateur clique le lien sécurisé (redirigé vers /set-password) et
   choisit LUI-MÊME son mot de passe : lui seul le connaît.
3. Le backend rattache le profil à l'entreprise (le trigger
   on_auth_user_created de sql/003 a déjà créé la ligne profiles).

La limite de 3 utilisateurs (rôle `user`) par entreprise est vérifiée ICI,
côté backend — jamais uniquement côté frontend.
"""

from fastapi import HTTPException, status

from app.core import audit
from app.core.config import settings
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client

MAX_USERS_PER_COMPANY = 3


def list_members(company_id: str) -> list[dict]:
    client = get_service_client()
    resp = (
        client.table("profiles")
        .select("id, email, full_name, job_title, role, created_at")
        .eq("company_id", company_id)
        .order("created_at")
        .execute()
    )
    return resp.data or []


def count_users(company_id: str) -> int:
    client = get_service_client()
    resp = (
        client.table("profiles")
        .select("id", count="exact")
        .eq("company_id", company_id)
        .eq("role", "user")
        .execute()
    )
    return resp.count or 0


def _activation_redirect_url() -> str:
    """Page où le collaborateur choisit son mot de passe (première origine CORS).
    L'URL doit figurer dans Auth > URL Configuration > Redirect URLs (Supabase)."""
    first_origin = settings.FRONTEND_URL.split(",")[0].strip().rstrip("/")
    return f"{first_origin}/set-password"


def invite_member(
    admin: CurrentUser,
    email: str,
    first_name: str,
    last_name: str,
    job_title: str = "",
) -> dict:
    if count_users(admin.company_id) >= MAX_USERS_PER_COMPANY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Limite atteinte : votre abonnement permet au maximum "
                f"{MAX_USERS_PER_COMPANY} utilisateurs en plus de l'admin. "
                f"Supprimez un utilisateur existant ou contactez Pukri AI Systems "
                f"pour faire évoluer votre offre."
            ),
        )

    full_name = f"{first_name.strip()} {last_name.strip()}".strip()
    client = get_service_client()
    try:
        # Invitation Supabase : compte créé avec un secret interne aléatoire
        # (jamais exposé), email d'activation envoyé au collaborateur qui
        # choisira lui-même son mot de passe. L'admin ne voit JAMAIS de
        # mot de passe — aucune usurpation possible.
        invited = client.auth.admin.invite_user_by_email(
            email,
            {
                "data": {"full_name": full_name, "job_title": job_title.strip()},
                "redirect_to": _activation_redirect_url(),
            },
        )
    except Exception as exc:
        message = str(exc).lower()
        if "already" in message or "registered" in message or "exists" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un compte existe déjà avec cet email.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Échec de l'envoi de l'invitation.",
        ) from exc

    new_user_id = invited.user.id

    # Le trigger a créé la ligne profiles ; upsert = robuste même si le trigger
    # n'est pas déployé. Écriture service_role : la RLS ne s'applique pas,
    # le scoping company_id vient du profil de l'admin authentifié.
    profile = {
        "id": str(new_user_id),
        "email": email,
        "full_name": full_name,
        "job_title": job_title.strip() or None,
        "company_id": admin.company_id,
        "role": "user",
    }
    try:
        client.table("profiles").upsert(profile).execute()
    except Exception as exc:
        # Rollback best-effort : on ne laisse pas un compte auth orphelin
        client.auth.admin.delete_user(str(new_user_id))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Échec du rattachement du profil, invitation annulée.",
        ) from exc

    audit.log_action(
        company_id=admin.company_id,
        actor_id=admin.id,
        action="team.member_invited",
        details={"member_id": str(new_user_id), "email": email},
    )
    return profile
