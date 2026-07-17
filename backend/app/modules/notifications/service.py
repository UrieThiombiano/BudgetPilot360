"""
Notifications applicatives — écrites par le backend (service_role), lues par
leur destinataire. La création est best-effort : un échec de notification ne
doit jamais faire échouer l'action métier qui l'a déclenchée.
"""

import logging
from datetime import datetime, timezone

from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client

logger = logging.getLogger(__name__)


def notify(
    *,
    company_id: str,
    user_id: str,
    type_: str,
    title: str,
    body: str | None = None,
    expense_id: str | None = None,
) -> None:
    try:
        get_service_client().table("notifications").insert(
            {
                "company_id": company_id,
                "user_id": user_id,
                "type": type_,
                "title": title,
                "body": body,
                "expense_id": expense_id,
            }
        ).execute()
    except Exception:
        logger.warning("Échec de création de notification (%s)", type_, exc_info=True)


def list_notifications(user: CurrentUser, limit: int = 30) -> list[dict]:
    rows = (
        get_service_client()
        .table("notifications")
        .select("id, type, title, body, expense_id, read_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []
    return [
        {
            "id": r["id"],
            "type": r["type"],
            "title": r["title"],
            "body": r.get("body"),
            "expense_id": r.get("expense_id"),
            "read": r.get("read_at") is not None,
            "created_at": r.get("created_at"),
        }
        for r in rows
    ]


def mark_all_read(user: CurrentUser) -> None:
    (
        get_service_client()
        .table("notifications")
        .update({"read_at": datetime.now(timezone.utc).isoformat()})
        .eq("user_id", user.id)
        .is_("read_at", "null")
        .execute()
    )
