"""
Dépenses automatiques (licences, abonnements, loyers…) — admin uniquement.

L'admin définit catégorie + montant + jour du mois + nombre de mois. Chaque
échéance crée une dépense DIRECTEMENT APPROUVÉE (décision produit : pas de
validation pour ce type), comptée dans budgets/dashboards/alertes comme une
dépense normale, puis l'automatisation s'arrête d'elle-même au dernier mois.

EXÉCUTION SANS CRON : le backend (Render gratuit) s'endort — un planificateur
interne raterait des échéances. On matérialise donc en « catch-up » au premier
accès (dashboard, dépenses, liste des automatisations) : toutes les échéances
arrivées à terme sont générées rétroactivement à leur vraie date. Idempotence
par l'index unique (recurring_id, expense_date) + vérification à l'insertion.
"""

import logging
from calendar import monthrange
from datetime import date

from fastapi import HTTPException, status

from app.core import audit
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client
from app.modules.budgets import alerts

logger = logging.getLogger(__name__)

_FIELDS = (
    "id, company_id, category_id, amount, description, day_of_month, "
    "months_total, months_done, active, next_due, created_by, created_at"
)


def _today() -> date:
    """Monkeypatchable en test (même convention que le dashboard)."""
    return date.today()


def _clamped_date(year: int, month: int, day: int) -> date:
    """« Chaque 31 du mois » vaut le dernier jour des mois plus courts."""
    return date(year, month, min(day, monthrange(year, month)[1]))


def first_due(today: date, day_of_month: int) -> date:
    """Première échéance : ce mois-ci si le jour n'est pas passé, sinon le mois
    prochain (on ne décompte jamais rétroactivement AVANT la création)."""
    candidate = _clamped_date(today.year, today.month, day_of_month)
    if candidate >= today:
        return candidate
    year, month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
    return _clamped_date(year, month, day_of_month)


def next_month_due(current: date, day_of_month: int) -> date:
    year, month = (current.year + 1, 1) if current.month == 12 else (current.year, current.month + 1)
    return _clamped_date(year, month, day_of_month)


def _get_expense_category(client, company_id: str, category_id: str) -> dict:
    rows = (
        client.table("categories")
        .select("id, name, type, company_id")
        .eq("id", category_id)
        .eq("company_id", company_id)
        .execute()
    ).data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Catégorie introuvable."
        )
    if (rows[0].get("type") or "expense") != "expense":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Une dépense automatique doit viser une catégorie de dépense.",
        )
    return rows[0]


def _category_names(client, company_id: str) -> dict[str, str]:
    rows = (
        client.table("categories").select("id, name").eq("company_id", company_id).execute()
    ).data or []
    return {c["id"]: c["name"] for c in rows}


def _out(r: dict, cat_names: dict[str, str]) -> dict:
    return {
        "id": r["id"],
        "category_id": r["category_id"],
        "category_name": cat_names.get(r["category_id"]),
        "amount": float(r["amount"]),
        "description": r["description"],
        "day_of_month": r["day_of_month"],
        "months_total": r["months_total"],
        "months_done": r["months_done"],
        "active": bool(r["active"]),
        "next_due": str(r["next_due"]),
        "created_at": r.get("created_at"),
    }


def create_recurring(admin: CurrentUser, payload) -> dict:
    client = get_service_client()
    category = _get_expense_category(client, admin.company_id, payload.category_id)

    row = {
        "company_id": admin.company_id,
        "created_by": admin.id,
        "category_id": payload.category_id,
        "amount": payload.amount,
        "description": payload.description.strip(),
        "day_of_month": payload.day_of_month,
        "months_total": payload.months_total,
        "active": payload.active,
        "next_due": first_due(_today(), payload.day_of_month).isoformat(),
    }
    created = client.table("recurring_expenses").insert(row).execute().data[0]

    audit.log_action(
        company_id=admin.company_id,
        actor_id=admin.id,
        action="recurring.created",
        details={
            "recurring_id": created["id"],
            "description": row["description"],
            "amount": payload.amount,
            "day_of_month": payload.day_of_month,
            "months_total": payload.months_total,
        },
    )
    # Si l'échéance du jour est déjà arrivée (création LE jour même), décompte immédiat.
    materialize_due(admin.company_id)
    refreshed = (
        client.table("recurring_expenses").select(_FIELDS).eq("id", created["id"]).execute()
    ).data[0]
    return _out(refreshed, {category["id"]: category["name"]})


def list_recurring(admin: CurrentUser) -> list[dict]:
    # Matérialise d'abord : la liste montre toujours un état à jour.
    materialize_due(admin.company_id)
    client = get_service_client()
    rows = (
        client.table("recurring_expenses")
        .select(_FIELDS)
        .eq("company_id", admin.company_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []
    names = _category_names(client, admin.company_id)
    return [_out(r, names) for r in rows]


def _get_scoped(client, admin: CurrentUser, recurring_id: str) -> dict:
    rows = (
        client.table("recurring_expenses").select(_FIELDS).eq("id", recurring_id).execute()
    ).data or []
    target = rows[0] if rows else None
    is_super = admin.role == "super_admin"
    # 404 hors périmètre : on ne divulgue pas l'existence d'une automatisation
    # d'une autre entreprise (même règle que team/remove_member).
    if target is None or (not is_super and target["company_id"] != admin.company_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Automatisation introuvable."
        )
    return target


def update_recurring(admin: CurrentUser, recurring_id: str, payload) -> dict:
    client = get_service_client()
    target = _get_scoped(client, admin, recurring_id)

    changes: dict = {}
    if payload.amount is not None:
        changes["amount"] = payload.amount
    if payload.description is not None:
        changes["description"] = payload.description.strip()
    if payload.day_of_month is not None and payload.day_of_month != target["day_of_month"]:
        changes["day_of_month"] = payload.day_of_month
        # Le jour change → la prochaine échéance est recalculée depuis aujourd'hui.
        changes["next_due"] = first_due(_today(), payload.day_of_month).isoformat()
    if payload.active is not None:
        if payload.active and target["months_done"] >= target["months_total"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cette automatisation est terminée — créez-en une nouvelle.",
            )
        changes["active"] = payload.active
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Aucune modification fournie."
        )

    client.table("recurring_expenses").update(changes).eq("id", recurring_id).execute()
    audit.log_action(
        company_id=target["company_id"],
        actor_id=admin.id,
        action="recurring.updated",
        details={"recurring_id": recurring_id, "changes": {k: str(v) for k, v in changes.items()}},
    )
    refreshed = (
        client.table("recurring_expenses").select(_FIELDS).eq("id", recurring_id).execute()
    ).data[0]
    return _out(refreshed, _category_names(client, target["company_id"]))


def delete_recurring(admin: CurrentUser, recurring_id: str) -> None:
    """Supprime l'automatisation. Les dépenses déjà décomptées RESTENT
    (recurring_id passe à null — l'historique budgétaire est intouchable)."""
    client = get_service_client()
    target = _get_scoped(client, admin, recurring_id)
    client.table("recurring_expenses").delete().eq("id", recurring_id).execute()
    audit.log_action(
        company_id=target["company_id"],
        actor_id=admin.id,
        action="recurring.deleted",
        details={"recurring_id": recurring_id, "description": target["description"]},
    )


def materialize_due(company_id: str) -> int:
    """Génère toutes les échéances arrivées à terme (catch-up rétroactif).

    Appelée en best-effort au chargement du dashboard et des dépenses : même si
    personne ne s'est connecté pendant plusieurs échéances, chacune est créée à
    SA date (le décompte budgétaire reste exact). Ne lève jamais.
    Retourne le nombre de dépenses générées.
    """
    generated = 0
    try:
        client = get_service_client()
        today = _today()
        due_rows = (
            client.table("recurring_expenses")
            .select(_FIELDS)
            .eq("company_id", company_id)
            .eq("active", True)
            .lte("next_due", today.isoformat())
            .execute()
        ).data or []

        for r in due_rows:
            next_due = date.fromisoformat(str(r["next_due"]))
            months_done = r["months_done"]
            while next_due <= today and months_done < r["months_total"]:
                # Idempotence (en plus de l'index unique) : jamais deux décomptes
                # pour la même échéance.
                existing = (
                    client.table("expenses")
                    .select("id")
                    .eq("recurring_id", r["id"])
                    .eq("expense_date", next_due.isoformat())
                    .execute()
                ).data or []
                if not existing:
                    expense = {
                        "company_id": company_id,
                        "user_id": r["created_by"],
                        "category_id": r["category_id"],
                        "amount": r["amount"],
                        "description": (
                            f"{r['description']} · automatique "
                            f"{months_done + 1}/{r['months_total']}"
                        ),
                        "status": "approved",  # décision produit : pas de validation
                        "expense_date": next_due.isoformat(),
                        "recurring_id": r["id"],
                    }
                    client.table("expenses").insert(expense).execute()
                    generated += 1
                    # Les seuils budgétaires (80/90/100 %) valent aussi pour
                    # les dépenses automatiques — best-effort, ne lève jamais.
                    alerts.check_after_approval(company_id=company_id, expense=expense)
                months_done += 1
                next_due = next_month_due(next_due, r["day_of_month"])

            client.table("recurring_expenses").update(
                {
                    "months_done": months_done,
                    "next_due": next_due.isoformat(),
                    # Dernier mois décompté → abandon automatique.
                    "active": months_done < r["months_total"],
                }
            ).eq("id", r["id"]).execute()
    except Exception:
        logger.warning(
            "Matérialisation des dépenses automatiques impossible pour %s",
            company_id,
            exc_info=True,
        )
    return generated
