"""Tests du Dashboard (Phase 5.1) : agrégats, fenêtres temporelles, RBAC."""

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import app.modules.dashboard.service as dash_service

TODAY = date(2026, 7, 15)

COMPANY = {
    "id": "11111111-1111-1111-1111-111111111111",
    "name": "Acme",
    "annual_budget": "50000.00",
}

CATEGORIES = [
    {"id": "c1", "name": "Transport", "planned_budget": "1000.00"},
    {"id": "c2", "name": "Salaires", "planned_budget": "5000.00"},
    {"id": "c3", "name": "Divers", "planned_budget": "300.00"},
]

EXPENSES = [
    # approuvée, mois courant → consommé + mois + trend
    {"amount": "100.00", "status": "approved", "expense_date": "2026-07-03", "category_id": "c1"},
    # approuvée, année courante, autre mois → consommé + trend
    {"amount": "200.00", "status": "approved", "expense_date": "2026-02-10", "category_id": "c2"},
    # approuvée, année précédente mais dans les 12 mois → trend uniquement
    {"amount": "50.00", "status": "approved", "expense_date": "2025-09-01", "category_id": "c1"},
    # approuvée, hors fenêtre de 12 mois → nulle part
    {"amount": "999.00", "status": "approved", "expense_date": "2025-06-30", "category_id": "c1"},
    # en attente, année courante
    {"amount": "40.00", "status": "pending", "expense_date": "2026-07-10", "category_id": "c3"},
    # en attente, ancienne → comptée quand même (appelle une action)
    {"amount": "10.00", "status": "pending", "expense_date": "2025-01-01", "category_id": "c3"},
    # rejetée, année courante
    {"amount": "70.00", "status": "rejected", "expense_date": "2026-03-05", "category_id": "c2"},
]

REVENUES = [
    # confirmée, mois courant → revenue_month + revenue_year + comparison
    {"amount": "500.00", "status": "approved", "revenue_date": "2026-07-05"},
    # confirmée, année courante autre mois → revenue_year + comparison
    {"amount": "300.00", "status": "approved", "revenue_date": "2026-02-15"},
    # en attente → revenue_pending_count
    {"amount": "80.00", "status": "pending", "revenue_date": "2026-07-20"},
]


def _mock_dashboard_client(monkeypatch, company=None, categories=None, expenses=None, revenues=None):
    """Chaînes utilisées par le service dashboard — toutes de la forme
    table(...).select(...).eq(...).execute()."""
    mock_client = MagicMock()

    def table_side_effect(name):
        return getattr(mock_client, name)

    mock_client.table.side_effect = table_side_effect
    mock_client.companies.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[COMPANY] if company is None else company
    )
    mock_client.categories.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=CATEGORIES if categories is None else categories
    )
    mock_client.expenses.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=EXPENSES if expenses is None else expenses
    )
    mock_client.revenues.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=REVENUES if revenues is None else revenues
    )

    monkeypatch.setattr(dash_service, "get_service_client", lambda: mock_client)
    monkeypatch.setattr(dash_service, "_today", lambda: TODAY)
    return mock_client


def test_summary_aggregates(client, as_admin, monkeypatch):
    _mock_dashboard_client(monkeypatch)

    resp = client.get("/dashboard/summary")

    assert resp.status_code == 200
    body = resp.json()
    assert body["company_name"] == "Acme"
    assert body["annual_budget"] == 50000.0
    assert body["consumed"] == 300.0  # 100 + 200 (approuvées 2026)
    assert body["remaining"] == 49700.0
    assert body["month_total"] == 100.0  # juillet 2026
    assert body["expenses_count"] == 4  # toutes dépenses 2026, tous statuts
    assert body["pending_count"] == 2  # y compris l'ancienne
    assert body["pending_amount"] == 50.0
    assert body["rejected_count"] == 1


def test_summary_revenue_and_profit(client, as_admin, monkeypatch):
    _mock_dashboard_client(monkeypatch)

    body = client.get("/dashboard/summary").json()

    assert body["revenue_year"] == 800.0  # 500 + 300 confirmées 2026
    assert body["revenue_month"] == 500.0  # juillet 2026
    assert body["revenue_pending_count"] == 1
    assert body["net_profit"] == 500.0  # 800 recettes - 300 dépenses approuvées
    assert body["margin"] == 62.5  # 500 / 800 * 100

    by_month = {p["month"]: p for p in body["comparison"]}
    assert by_month["2026-07"] == {"month": "2026-07", "revenues": 500.0, "expenses": 100.0, "net": 400.0}
    assert by_month["2026-02"] == {"month": "2026-02", "revenues": 300.0, "expenses": 200.0, "net": 100.0}
    assert len(body["comparison"]) == 12


def test_summary_no_revenue_margin_is_null(client, as_admin, monkeypatch):
    _mock_dashboard_client(monkeypatch, revenues=[])

    body = client.get("/dashboard/summary").json()

    assert body["revenue_year"] == 0.0
    assert body["margin"] is None
    assert body["net_profit"] == -300.0  # 0 recette - 300 dépenses = perte


def test_summary_monthly_trend_window(client, as_admin, monkeypatch):
    _mock_dashboard_client(monkeypatch)

    body = client.get("/dashboard/summary").json()
    trend = body["monthly_trend"]

    assert len(trend) == 12
    assert trend[0]["month"] == "2025-08"  # plus ancien d'abord
    assert trend[-1]["month"] == "2026-07"
    by_month = {p["month"]: p for p in trend}
    assert by_month["2025-09"] == {"month": "2025-09", "total": 50.0, "count": 1}
    assert by_month["2026-02"]["total"] == 200.0
    assert by_month["2026-07"]["total"] == 100.0
    # la dépense de 2025-06 (hors fenêtre) n'apparaît nulle part
    assert "2025-06" not in by_month
    assert sum(p["total"] for p in trend) == 350.0


def test_summary_top_categories(client, as_admin, monkeypatch):
    _mock_dashboard_client(monkeypatch)

    body = client.get("/dashboard/summary").json()
    top = body["top_categories"]

    # Triées par consommé de l'année en cours, décroissant
    assert [c["id"] for c in top] == ["c2", "c1", "c3"]
    assert top[0]["consumed"] == 200.0
    assert top[0]["planned_budget"] == 5000.0
    assert top[1]["consumed"] == 100.0  # les dépenses 2025 de c1 ne comptent pas
    assert top[2]["consumed"] == 0.0


def test_summary_january_trend_spans_two_years(client, as_admin, monkeypatch):
    _mock_dashboard_client(monkeypatch, expenses=[])
    monkeypatch.setattr(dash_service, "_today", lambda: date(2026, 1, 10))

    body = client.get("/dashboard/summary").json()
    months = [p["month"] for p in body["monthly_trend"]]

    assert months[0] == "2025-02"
    assert months[-1] == "2026-01"
    assert len(months) == 12


def test_summary_empty_company(client, as_admin, monkeypatch):
    _mock_dashboard_client(monkeypatch, categories=[], expenses=[])

    body = client.get("/dashboard/summary").json()

    assert body["consumed"] == 0.0
    assert body["remaining"] == 50000.0
    assert body["pending_count"] == 0
    assert body["top_categories"] == []
    assert len(body["monthly_trend"]) == 12
    assert all(p["total"] == 0.0 for p in body["monthly_trend"])


def test_summary_company_not_found(client, as_admin, monkeypatch):
    _mock_dashboard_client(monkeypatch, company=[])

    resp = client.get("/dashboard/summary")

    assert resp.status_code == 404


def test_summary_forbidden_for_user(client, as_user, monkeypatch):
    mock_client = _mock_dashboard_client(monkeypatch)

    resp = client.get("/dashboard/summary")

    assert resp.status_code == 403
    mock_client.table.assert_not_called()
