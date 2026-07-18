"""
Vérifie les JWT émis par Supabase Auth sur chaque requête entrante,
puis résout le profil applicatif (company_id, role) via la table `profiles`.

Le RBAC applicatif (qui a le droit de faire quoi) est vérifié ICI, côté backend,
en plus de la RLS Postgres — defense in depth, jamais l'un sans l'autre.
"""

from dataclasses import dataclass
from typing import Literal

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.core.config import settings
from app.core.supabase_client import get_service_client

bearer_scheme = HTTPBearer()

Role = Literal["super_admin", "admin", "user"]

# Algorithmes acceptés. Le projet Supabase signe désormais en ES256 (JWT Signing
# Keys, clé ECC P-256) ; HS256 reste supporté en fallback (secret legacy, tests).
ALLOWED_ALGORITHMS = ("ES256", "RS256", "HS256")

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    """Client JWKS (clés publiques de signature Supabase), avec cache des clés."""
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            lifespan=3600,
        )
    return _jwks_client


def _decode_token(token: str) -> dict:
    alg = jwt.get_unverified_header(token).get("alg")
    if alg not in ALLOWED_ALGORITHMS:
        raise jwt.InvalidAlgorithmError(f"Algorithme non supporté : {alg}")

    if alg == "HS256":
        if not settings.SUPABASE_JWT_SECRET:
            raise jwt.InvalidKeyError("SUPABASE_JWT_SECRET non configuré")
        key = settings.SUPABASE_JWT_SECRET
    else:
        key = _get_jwks_client().get_signing_key_from_jwt(token).key

    return jwt.decode(token, key, algorithms=[alg], audience="authenticated")


@dataclass
class CurrentUser:
    id: str
    email: str | None
    company_id: str | None
    role: Role
    # Rôle dans l'entreprise (ex : Directeur Général, Comptable) — libellé
    # affiché partout à la place du rôle technique admin/user.
    job_title: str | None = None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    token = credentials.credentials
    try:
        payload = _decode_token(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token invalide : {exc}",
        ) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sans sujet")

    # On va chercher le profil applicatif (company_id, role) avec le service_role
    # pour bypasser la RLS ici — c'est le backend qui fait autorité sur le RBAC.
    client = get_service_client()
    resp = (
        client.table("profiles")
        .select("company_id, role, job_title")
        .eq("id", user_id)
        .execute()
    )
    if not resp.data:
        # Ne devrait pas arriver : le trigger on_auth_user_created (sql/003) crée le
        # profil à l'inscription. Filet de sécurité si le trigger n'est pas déployé.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Profil introuvable")

    profile = resp.data[0]
    return CurrentUser(
        id=user_id,
        email=payload.get("email"),
        company_id=profile["company_id"],
        role=profile["role"],
        job_title=profile.get("job_title"),
    )


def require_role(*allowed: Role):
    """Dépendance FastAPI : restreint un endpoint à une liste de rôles.

    Usage: @router.post(..., dependencies=[Depends(require_role("admin"))])
    """

    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Rôle requis : {allowed}, rôle actuel : {user.role}",
            )
        return user

    return checker
