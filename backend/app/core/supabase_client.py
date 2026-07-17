"""
Deux clients Supabase distincts :
- service_client : clé service_role, bypass la RLS. Réservé aux opérations backend
  qui font autorité (vérif RBAC, écritures orchestrées, Storage). NE JAMAIS exposer
  cette clé au frontend.
- anon_client : clé anon, respecte la RLS. Utile si le backend doit exécuter une
  requête "au nom" d'un utilisateur sans bypasser ses droits.
"""

from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings


@lru_cache
def get_service_client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


@lru_cache
def get_anon_client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
