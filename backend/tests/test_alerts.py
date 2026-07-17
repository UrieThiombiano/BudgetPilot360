"""Tests des alertes de seuil budgétaire (Phase 6.1) : franchissement,
anti-doublons, seuil le plus haut, périmètre année civile, best-effort."""

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import app.modules.budgets.alerts as alerts
from tests.conftest import ADMIN

# Capturée à l'import (avant fixtures) : la fixture autouse capture_threshold_checks
# remplace l'attribut de module ; cette référence reste la vraie fonction.
REAL_CHECK_AFTER_APPROVAL = alerts.check_after_approval

COMPANY_ID = ADMIN.company_id
NEW_EXPENSE = {"id": "e-new", "category_id": "c1"}
TODAY = date(2026, 7, 16)


# --- Unitaire : détection de franchissement ---


def test_highest_crossed_threshold():
    # franchit 80 (pas 90)
    assert alerts.highest_crossed_threshold(0, 85, 100) == 80
    # franchit 90 pile (borne incluse côté "après")
    assert alerts.highest_crossed_threshold(85, 90, 100) == 90
    # déjà au-dessus : pas de re-déclenchement (anti-doublon)
    assert alerts.highest_crossed_threshold(85, 87, 100) is None
    # plusieurs seuils d'un coup : seul le plus haut
    assert alerts.highest_crossed_threshold(0, 120, 100) == 100
    # budget non défini : jamais d'alerte
    assert alerts.highest_crossed_threshold(0, 999, 0) is None
    # sous le premier seuil
    assert alerts.highest_crossed_threshold(0, 79.99, 100) is None


# --- Intégration du contrôle (client mocké) ---


def _mock_alerts_client(
    monkeypatch,
    *,
    approved,
    planned_budget="100.00",
    annual_budget="10000.00",
):
    mock_client = MagicMock()
    tables = {
        "expenses": MagicMock(),
        "categories": MagicMock(),
        "companies": MagicMock(),
        "profiles": MagicMock(),
    }
    mock_client.table.side_effect = lambda name: tables[name]
    mock_client.tables = tables

    tables["expenses"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=approved
    )
    tables["categories"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "c1", "name": "Transport", "planned_budget": planned_budget}]
    )
    tables["companies"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": COMPANY_ID, "annual_budget": annual_budget}]
    )
    tables["profiles"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": ADMIN.id}]
    )

    monkeypatch.setattr(alerts, "get_service_client", lambda: mock_client)
    monkeypatch.setattr(alerts, "_today", lambda: TODAY)
    return mock_client


def test_category_crosses_80(monkeypatch, capture_notifications):
    _mock_alerts_client(
        monkeypatch,
        approved=[
            {"id": "e-new", "amount": "85.00", "category_id": "c1", "expense_date": "2026-07-16"}
        ],
    )

    REAL_CHECK_AFTER_APPROVAL(company_id=COMPANY_ID, expense=NEW_EXPENSE)

    assert len(capture_notifications) == 1
    notif = capture_notifications[0]
    assert notif["type_"] == "budget_threshold_80"
    assert notif["user_id"] == ADMIN.id  # destinataire : l'admin
    assert "80 %" in notif["title"]
    assert "Transport" in notif["title"]
    assert notif["expense_id"] == "e-new"


def test_category_and_annual_cross_together(monkeypatch, capture_notifications):
    _mock_alerts_client(
        monkeypatch,
        annual_budget="180.00",
        approved=[
            {"id": "e0", "amount": "60.00", "category_id": "c2", "expense_date": "2026-03-01"},
            {"id": "e-new", "amount": "90.00", "category_id": "c1", "expense_date": "2026-07-16"},
        ],
    )

    REAL_CHECK_AFTER_APPROVAL(company_id=COMPANY_ID, expense=NEW_EXPENSE)

    types = sorted(n["type_"] for n in capture_notifications)
    assert types == ["budget_threshold_80", "budget_threshold_90"]
    annual = next(n for n in capture_notifications if "annuel" in n["title"])
    assert annual["type_"] == "budget_threshold_80"  # 150/180 = 83 %
    category = next(n for n in capture_notifications if "Transport" in n["title"])
    assert category["type_"] == "budget_threshold_90"  # 90/100 pile


def test_no_alert_when_already_above(monkeypatch, capture_notifications):
    """Anti-doublon : le consommé était déjà au-dessus de 80 %, on ne re-alerte pas."""
    _mock_alerts_client(
        monkeypatch,
        approved=[
            {"id": "e0", "amount": "85.00", "category_id": "c1", "expense_date": "2026-01-05"},
            {"id": "e-new", "amount": "2.00", "category_id": "c1", "expense_date": "2026-07-16"},
        ],
    )

    REAL_CHECK_AFTER_APPROVAL(company_id=COMPANY_ID, expense=NEW_EXPENSE)

    assert capture_notifications == []


def test_only_highest_threshold_fires(monkeypatch, capture_notifications):
    """120 € sur 100 € prévus : 80, 90 et 100 franchis d'un coup → une seule alerte (épuisé)."""
    _mock_alerts_client(
        monkeypatch,
        approved=[
            {"id": "e-new", "amount": "120.00", "category_id": "c1", "expense_date": "2026-07-16"}
        ],
    )

    REAL_CHECK_AFTER_APPROVAL(company_id=COMPANY_ID, expense=NEW_EXPENSE)

    assert len(capture_notifications) == 1
    assert capture_notifications[0]["type_"] == "budget_threshold_100"
    assert "épuisé" in capture_notifications[0]["title"]


def test_previous_year_expense_ignored(monkeypatch, capture_notifications):
    """Une dépense datée de l'année précédente n'entame pas les budgets de l'année."""
    _mock_alerts_client(
        monkeypatch,
        approved=[
            {"id": "e-new", "amount": "500.00", "category_id": "c1", "expense_date": "2025-12-31"}
        ],
    )

    REAL_CHECK_AFTER_APPROVAL(company_id=COMPANY_ID, expense=NEW_EXPENSE)

    assert capture_notifications == []


def test_check_never_raises(monkeypatch, capture_notifications):
    """Best-effort : un échec du contrôle ne doit jamais faire échouer l'approbation."""
    broken = MagicMock()
    broken.table.side_effect = Exception("boom réseau")
    monkeypatch.setattr(alerts, "get_service_client", lambda: broken)

    REAL_CHECK_AFTER_APPROVAL(company_id=COMPANY_ID, expense=NEW_EXPENSE)  # ne lève pas

    assert capture_notifications == []
