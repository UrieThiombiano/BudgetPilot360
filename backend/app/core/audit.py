"""
Audit log des actions sensibles (cf. CLAUDE.md — non négociable).

L'écriture est best-effort : un échec d'audit est loggé mais ne fait JAMAIS
échouer l'action métier (sinon un incident d'audit bloquerait toute l'app).
Table alimentée uniquement par le backend via service_role (aucune policy
d'insert côté client, cf. sql/004_audit_logs.sql).
"""

import logging

from app.core.supabase_client import get_service_client

logger = logging.getLogger(__name__)


def log_action(
    *,
    company_id: str,
    actor_id: str | None,
    action: str,
    details: dict | None = None,
) -> None:
    try:
        get_service_client().table("audit_logs").insert(
            {
                "company_id": company_id,
                "actor_id": actor_id,
                "action": action,
                "details": details or {},
            }
        ).execute()
    except Exception:
        logger.warning("Échec d'écriture de l'audit log (%s)", action, exc_info=True)
