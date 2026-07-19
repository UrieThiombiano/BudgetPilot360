"""
Transactions automatiques mensuelles — dépenses ET recettes (admin uniquement,
adjoint compris ; les users ne voient jamais ces automatisations).

L'admin définit catégorie + montant + jour du mois + nombre de mois ; chaque
échéance matérialise une transaction, puis l'automatisation s'arrête
d'elle-même au dernier mois. La logique est PARTAGÉE entre les deux familles
via `RecurringSpec` (même patron que `app.core.transactions.TxSpec`).

VALIDATION (décision produit) : une dépense automatique suit le MÊME workflow
que toute dépense — générée au statut `pending`, elle doit être approuvée ou
rejetée par un admin (notifié à chaque échéance générée). Le consommé
budgétaire et les alertes de seuil ne bougent qu'à l'approbation, via le flux
de revue standard (`/expenses/{id}/review`). Une recette automatique suit la
règle des recettes : confirmée dès sa création, sans validation.

Une échéance générée consomme son mois même si elle est rejetée ensuite : elle
n'est jamais régénérée (index unique (recurring_id, date) + vérification à
l'insertion) — le rejet est la décision de ne pas la compter, pas de la rejouer.

EXÉCUTION SANS CRON : le backend (Render gratuit) s'endort — un planificateur
interne raterait des échéances. On matérialise donc en « catch-up » au premier
accès (dashboard, dépenses, recettes, liste des automatisations) : toutes les
échéances arrivées à terme sont générées rétroactivement à leur vraie date.
"""

import logging
from calendar import monthrange
from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException, status

from app.core import audit
from app.core.money import fcfa
from app.core.security import CurrentUser
from app.core.supabase_client import get_service_client
from app.modules.notifications import service as notifications

logger = logging.getLogger(__name__)

_FIELDS = (
    "id, company_id, category_id, amount, description, day_of_month, "
    "months_total, months_done, active, next_due, created_by, created_at"
)


@dataclass(frozen=True)
class RecurringSpec:
    """Décrit une famille d'automatisations (dépense ou recette)."""

    table: str  # "recurring_expenses" | "recurring_revenues"
    tx_table: str  # "expenses" | "revenues"
    tx_date_field: str  # "expense_date" | "revenue_date"
    category_type: str  # type attendu de la catégorie visée
    kind: str  # "expense" | "revenue"
    audit_prefix: str  # "recurring" | "recurring_revenue"
    bad_category_detail: str
    # 'pending' pour une dépense (workflow de validation standard),
    # 'approved' pour une recette (règle produit : comptée sans validation).
    initial_status: str
    # Une échéance générée en pending doit être vue : on notifie les admins.
    notify_pending: bool


EXPENSE_SPEC = RecurringSpec(
    table="recurring_expenses",
    tx_table="expenses",
    tx_date_field="expense_date",
    category_type="expense",
    kind="expense",
    audit_prefix="recurring",
    bad_category_detail="Une dépense automatique doit viser une catégorie de dépense.",
    initial_status="pending",
    notify_pending=True,
)

REVENUE_SPEC = RecurringSpec(
    table="recurring_revenues",
    tx_table="revenues",
    tx_date_field="revenue_date",
    category_type="revenue",
    kind="revenue",
    audit_prefix="recurring_revenue",
    bad_category_detail="Une recette automatique doit viser une catégorie de recette.",
    initial_status="approved",
    notify_pending=False,
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


def _category_names(client, company_id: str) -> dict[str, str]:
    rows = (
        client.table("categories").select("id, name").eq("company_id", company_id).execute()
    ).data or []
    return {c["id"]: c["name"] for c in rows}


class RecurringService:
    """CRUD + matérialisation catch-up, paramétrés par famille (spec)."""

    def __init__(self, spec: RecurringSpec) -> None:
        self.spec = spec

    def _get_category(self, client, company_id: str, category_id: str) -> dict:
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
        if (rows[0].get("type") or "expense") != self.spec.category_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=self.spec.bad_category_detail,
            )
        return rows[0]

    def create(self, admin: CurrentUser, payload) -> dict:
        client = get_service_client()
        category = self._get_category(client, admin.company_id, payload.category_id)

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
        created = client.table(self.spec.table).insert(row).execute().data[0]

        audit.log_action(
            company_id=admin.company_id,
            actor_id=admin.id,
            action=f"{self.spec.audit_prefix}.created",
            details={
                "recurring_id": created["id"],
                "description": row["description"],
                "amount": payload.amount,
                "day_of_month": payload.day_of_month,
                "months_total": payload.months_total,
            },
        )
        # Si l'échéance du jour est déjà arrivée (création LE jour même), génération
        # immédiate — via le point d'entrée module (neutralisable en test).
        materialize_due(admin.company_id)
        refreshed = (
            client.table(self.spec.table).select(_FIELDS).eq("id", created["id"]).execute()
        ).data[0]
        return _out(refreshed, {category["id"]: category["name"]})

    def list(self, admin: CurrentUser) -> list[dict]:
        # Matérialise d'abord : la liste montre toujours un état à jour.
        materialize_due(admin.company_id)
        client = get_service_client()
        rows = (
            client.table(self.spec.table)
            .select(_FIELDS)
            .eq("company_id", admin.company_id)
            .order("created_at", desc=True)
            .execute()
        ).data or []
        names = _category_names(client, admin.company_id)
        return [_out(r, names) for r in rows]

    def _get_scoped(self, client, admin: CurrentUser, recurring_id: str) -> dict:
        rows = (
            client.table(self.spec.table).select(_FIELDS).eq("id", recurring_id).execute()
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

    def update(self, admin: CurrentUser, recurring_id: str, payload) -> dict:
        client = get_service_client()
        target = self._get_scoped(client, admin, recurring_id)

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

        client.table(self.spec.table).update(changes).eq("id", recurring_id).execute()
        audit.log_action(
            company_id=target["company_id"],
            actor_id=admin.id,
            action=f"{self.spec.audit_prefix}.updated",
            details={"recurring_id": recurring_id, "changes": {k: str(v) for k, v in changes.items()}},
        )
        refreshed = (
            client.table(self.spec.table).select(_FIELDS).eq("id", recurring_id).execute()
        ).data[0]
        return _out(refreshed, _category_names(client, target["company_id"]))

    def delete(self, admin: CurrentUser, recurring_id: str) -> None:
        """Supprime l'automatisation. Les transactions déjà générées RESTENT
        (recurring_id passe à null — l'historique budgétaire est intouchable)."""
        client = get_service_client()
        target = self._get_scoped(client, admin, recurring_id)
        client.table(self.spec.table).delete().eq("id", recurring_id).execute()
        audit.log_action(
            company_id=target["company_id"],
            actor_id=admin.id,
            action=f"{self.spec.audit_prefix}.deleted",
            details={"recurring_id": recurring_id, "description": target["description"]},
        )

    def _notify_admins_pending(self, client, company_id: str, tx: dict, tx_id: str | None) -> None:
        """Une échéance générée en pending sans action humaine doit être vue :
        chaque admin actif (principal + adjoint) est notifié. Best-effort."""
        try:
            admins = (
                client.table("profiles")
                .select("id")
                .eq("company_id", company_id)
                .eq("role", "admin")
                .is_("removed_at", "null")
                .execute()
            ).data or []
            for a in admins:
                notifications.notify(
                    company_id=company_id,
                    user_id=a["id"],
                    type_="expense_pending_auto",
                    title=f"Dépense automatique de {fcfa(float(tx['amount']))} à valider",
                    body=(
                        f"{tx['description']} — échéance du {tx[self.spec.tx_date_field]}. "
                        "Approuvez-la ou rejetez-la dans « Dépenses à valider »."
                    ),
                    expense_id=tx_id,
                )
        except Exception:
            logger.warning(
                "Notification des admins impossible (dépense automatique, %s)",
                company_id,
                exc_info=True,
            )

    def materialize(self, company_id: str) -> int:
        """Génère toutes les échéances arrivées à terme (catch-up rétroactif).

        Même si personne ne s'est connecté pendant plusieurs échéances, chacune
        est créée à SA date (le décompte reste exact). Ne lève jamais.
        Retourne le nombre de transactions générées.
        """
        generated = 0
        try:
            client = get_service_client()
            today = _today()
            due_rows = (
                client.table(self.spec.table)
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
                    # Idempotence (en plus de l'index unique) : jamais deux
                    # générations pour la même échéance — un rejet compte aussi.
                    existing = (
                        client.table(self.spec.tx_table)
                        .select("id")
                        .eq("recurring_id", r["id"])
                        .eq(self.spec.tx_date_field, next_due.isoformat())
                        .execute()
                    ).data or []
                    if not existing:
                        tx = {
                            "company_id": company_id,
                            "user_id": r["created_by"],
                            "category_id": r["category_id"],
                            "amount": r["amount"],
                            "description": (
                                f"{r['description']} · automatique "
                                f"{months_done + 1}/{r['months_total']}"
                            ),
                            "status": self.spec.initial_status,
                            self.spec.tx_date_field: next_due.isoformat(),
                            "recurring_id": r["id"],
                        }
                        inserted = (
                            client.table(self.spec.tx_table).insert(tx).execute()
                        ).data or []
                        generated += 1
                        if self.spec.notify_pending:
                            # La validation (et donc consommé + alertes de seuil)
                            # passe par le flux de revue standard.
                            self._notify_admins_pending(
                                client,
                                company_id,
                                tx,
                                inserted[0]["id"] if inserted else None,
                            )
                    months_done += 1
                    next_due = next_month_due(next_due, r["day_of_month"])

                client.table(self.spec.table).update(
                    {
                        "months_done": months_done,
                        "next_due": next_due.isoformat(),
                        # Dernier mois généré → arrêt automatique.
                        "active": months_done < r["months_total"],
                    }
                ).eq("id", r["id"]).execute()
        except Exception:
            logger.warning(
                "Matérialisation des transactions automatiques (%s) impossible pour %s",
                self.spec.kind,
                company_id,
                exc_info=True,
            )
        return generated


expenses_service = RecurringService(EXPENSE_SPEC)
revenues_service = RecurringService(REVENUE_SPEC)


def materialize_due(company_id: str) -> int:
    """Catch-up des DEUX familles — point d'entrée unique des routers
    (dashboard, dépenses, recettes) et seam de neutralisation des tests."""
    return expenses_service.materialize(company_id) + revenues_service.materialize(company_id)
