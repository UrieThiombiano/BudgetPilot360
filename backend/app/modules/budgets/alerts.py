"""
Alertes de seuil budgétaire (Phase 6.1).

À chaque APPROBATION de dépense, on vérifie si la catégorie concernée ou le
budget annuel vient de franchir 80 %, 90 % ou 100 % de consommation, et on
notifie le(s) admin(s) de l'entreprise. Best-effort, même contrat que
`notifications.notify` : une alerte qui échoue ne fait jamais échouer
l'approbation qui l'a déclenchée.

Anti-doublons par construction : on alerte uniquement au FRANCHISSEMENT —
le consommé AVANT cette approbation (somme des approuvées moins cette dépense)
était sous le seuil, le consommé APRÈS est dessus. Le consommé ne faisant que
croître, chaque seuil ne se déclenche qu'une fois. Si l'admin abaisse ensuite
un budget et qu'une approbation re-franchit le seuil, on re-alerte : c'est le
comportement voulu. Si plusieurs seuils sont franchis d'un coup, seul le plus
haut est notifié.

Périmètre temporel : année civile en cours, comme le dashboard (Phase 5.1).
"""

import logging
from datetime import date

from app.core.money import fcfa
from app.core.supabase_client import get_service_client
from app.modules.notifications import service as notifications

logger = logging.getLogger(__name__)

THRESHOLDS = (100, 90, 80)  # du plus haut au plus bas : le premier atteint gagne


def _today() -> date:
    """Isolé pour être monkeypatchable en test (fenêtres déterministes)."""
    return date.today()


def highest_crossed_threshold(before: float, after: float, limit: float) -> int | None:
    """Le plus haut seuil (%) que `after` atteint et que `before` n'atteignait pas."""
    if limit <= 0:
        return None
    for pct in THRESHOLDS:
        bar = limit * pct / 100
        if before < bar <= after:
            return pct
    return None


def check_after_approval(*, company_id: str, expense: dict) -> None:
    """À appeler après une approbation réussie. Ne lève jamais."""
    try:
        _check(company_id=company_id, expense=expense)
    except Exception:
        logger.warning("Échec du contrôle de seuils budgétaires", exc_info=True)


def _check(*, company_id: str, expense: dict) -> None:
    today = _today()
    year_prefix = f"{today.year:04d}-"
    client = get_service_client()

    approved = (
        client.table("expenses")
        .select("id, amount, category_id, expense_date")
        .eq("company_id", company_id)
        .eq("status", "approved")
        .execute()
    ).data or []
    in_year = [
        e for e in approved if str(e.get("expense_date") or "").startswith(year_prefix)
    ]

    def consumed(rows: list[dict], exclude_id: str | None = None) -> float:
        return sum(float(r["amount"]) for r in rows if r["id"] != exclude_id)

    expense_id = expense["id"]
    alerts: list[tuple[str, str, str]] = []  # (type, title, body)

    # --- Seuils de la catégorie de la dépense ---
    cat_resp = (
        client.table("categories")
        .select("id, name, planned_budget")
        .eq("id", expense["category_id"])
        .eq("company_id", company_id)
        .execute()
    )
    if cat_resp.data:
        category = cat_resp.data[0]
        planned = float(category.get("planned_budget") or 0)
        cat_rows = [e for e in in_year if e["category_id"] == expense["category_id"]]
        after_cat = consumed(cat_rows)
        pct = highest_crossed_threshold(consumed(cat_rows, expense_id), after_cat, planned)
        if pct is not None:
            name = category["name"]
            title = (
                f"Catégorie « {name} » : budget épuisé"
                if pct == 100
                else f"Catégorie « {name} » à {pct} % de son budget"
            )
            body = f"{fcfa(after_cat)} consommés sur {fcfa(planned)} prévus en {today.year}."
            alerts.append((f"budget_threshold_{pct}", title, body))

    # --- Seuils du budget annuel ---
    company_resp = (
        client.table("companies")
        .select("id, annual_budget")
        .eq("id", company_id)
        .execute()
    )
    if company_resp.data:
        annual_budget = float(company_resp.data[0].get("annual_budget") or 0)
        after_total = consumed(in_year)
        pct = highest_crossed_threshold(
            consumed(in_year, expense_id), after_total, annual_budget
        )
        if pct is not None:
            title = "Budget annuel épuisé" if pct == 100 else f"Budget annuel à {pct} %"
            body = f"{fcfa(after_total)} consommés sur {fcfa(annual_budget)} en {today.year}."
            alerts.append((f"budget_threshold_{pct}", title, body))

    if not alerts:
        return

    # Destinataires : le(s) admin(s) de l'entreprise (1 par entreprise en v1)
    admins = (
        client.table("profiles")
        .select("id")
        .eq("company_id", company_id)
        .eq("role", "admin")
        .execute()
    ).data or []

    for admin in admins:
        for type_, title, body in alerts:
            notifications.notify(
                company_id=company_id,
                user_id=admin["id"],
                type_=type_,
                title=title,
                body=body,
                expense_id=expense_id,
            )
