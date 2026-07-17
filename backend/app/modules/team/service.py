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

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.core import audit
from app.core.config import settings
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client

logger = logging.getLogger(__name__)

MAX_USERS_PER_COMPANY = 3

# Bannissement Auth d'un utilisateur retiré : durée « quasi infinie » (100 ans).
# Réversible côté Supabase (ban_duration = "none" pour réactiver).
REMOVED_BAN_DURATION = "876000h"


def classify_invite_error(exc: Exception) -> tuple[int, str]:
    """Traduit une exception `invite_user_by_email` (Supabase/GoTrue) en
    (status_code, message ACTIONNABLE affiché tel quel à l'utilisateur).

    Sans ça, toute erreur retombe sur un « Échec » générique qui masque la vraie
    cause — typiquement le quota du service email intégré de Supabase (limité à
    quelques envois par heure), qui est LA cause la plus fréquente en production
    tant qu'aucun SMTP personnalisé n'est configuré.
    Source de vérité unique, partagée avec le module `registration`.
    """
    message = str(exc).lower()
    if "already" in message or "registered" in message or "exists" in message:
        return status.HTTP_409_CONFLICT, "Un compte existe déjà avec cet email."
    if "rate limit" in message or "too many" in message:
        return status.HTTP_502_BAD_GATEWAY, (
            "Quota d'emails atteint : le service d'envoi intégré de Supabase est "
            "limité à quelques emails par heure. Réessayez dans une heure, ou "
            "configurez un SMTP personnalisé (ex. Brevo) pour lever cette limite."
        )
    if "invalid" in message:
        return status.HTTP_422_UNPROCESSABLE_ENTITY, (
            "Adresse email refusée : elle semble invalide ou non délivrable "
            "(domaine sans serveur mail). Vérifiez l'orthographe de l'adresse."
        )
    return status.HTTP_502_BAD_GATEWAY, "Échec de l'envoi de l'invitation."


def list_members(company_id: str) -> list[dict]:
    """Membres ACTIFS de l'entreprise (les profils retirés sont exclus)."""
    client = get_service_client()
    resp = (
        client.table("profiles")
        .select("id, email, full_name, job_title, role, created_at")
        .eq("company_id", company_id)
        .is_("removed_at", "null")
        .order("created_at")
        .execute()
    )
    return resp.data or []


def count_users(company_id: str) -> int:
    """Nombre d'utilisateurs ACTIFS (role=user, non retirés) : base de la limite de 3."""
    client = get_service_client()
    resp = (
        client.table("profiles")
        .select("id", count="exact")
        .eq("company_id", company_id)
        .eq("role", "user")
        .is_("removed_at", "null")
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
        # On journalise la cause RÉELLE (visible dans les logs Render) et on
        # renvoie à l'admin un message actionnable, jamais un « Échec » opaque.
        logger.warning("Invitation collaborateur échouée pour %s : %s", email, exc)
        code, detail = classify_invite_error(exc)
        raise HTTPException(status_code=code, detail=detail) from exc

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


def remove_member(admin: CurrentUser, member_id: str) -> None:
    """Retire (désactive) un utilisateur : profil marqué `removed_at` + compte
    Auth banni. Le slot des 3 users se libère, l'historique de dépenses reste
    intact (imputabilité). On ne supprime JAMAIS le profil (FK ON DELETE RESTRICT).

    RBAC (vérifié ICI, côté backend) :
    - seul un membre `user` peut être retiré (jamais un admin/super_admin) ;
    - un admin ne peut retirer que dans SA propre entreprise ;
    - un super_admin peut retirer dans n'importe quelle entreprise ;
    - impossible de se retirer soi-même.
    """
    client = get_service_client()
    resp = (
        client.table("profiles")
        .select("id, company_id, role, removed_at, email")
        .eq("id", member_id)
        .execute()
    )
    rows = resp.data or []
    target = rows[0] if rows else None

    # 404 aussi pour un profil hors du périmètre de l'admin : on ne divulgue pas
    # l'existence d'un utilisateur d'une autre entreprise (le super_admin bypass).
    is_super = admin.role == "super_admin"
    if target is None or (not is_super and target["company_id"] != admin.company_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable."
        )

    if target["id"] == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous ne pouvez pas vous retirer vous-même.",
        )

    if target["role"] != "user":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seul un utilisateur peut être retiré (pas un administrateur).",
        )

    if target["removed_at"] is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cet utilisateur est déjà retiré.",
        )

    now = datetime.now(timezone.utc).isoformat()
    client.table("profiles").update({"removed_at": now}).eq("id", member_id).execute()

    # Bannissement du compte Auth : plus aucune session possible. Best-effort —
    # si l'appel échoue, le profil est déjà marqué retiré (hors liste/compte) ;
    # on journalise sans faire échouer l'action.
    try:
        client.auth.admin.update_user_by_id(
            member_id, {"ban_duration": REMOVED_BAN_DURATION}
        )
    except Exception:
        logger.warning(
            "Échec du bannissement Auth pour %s (profil déjà marqué retiré)",
            member_id,
            exc_info=True,
        )

    audit.log_action(
        company_id=target["company_id"],
        actor_id=admin.id,
        action="team.member_removed",
        details={"member_id": member_id, "email": target.get("email")},
    )
