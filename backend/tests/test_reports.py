"""Tests des rapports (Phase 7.1) : données, PDF, Excel, RBAC, période, audit."""

import io
from types import SimpleNamespace
from unittest.mock import MagicMock

from openpyxl import load_workbook

import app.modules.reports.service as reports_service

COMPANY = {
    "id": "11111111-1111-1111-1111-111111111111",
    "name": "Acme",
    "annual_budget": "50000.00",
}
CATEGORIES = [
    {"id": "c1", "name": "Transport", "planned_budget": "1000.00"},
    {"id": "c2", "name": "Salaires", "planned_budget": "0.00"},
]
PROFILES = [
    {"id": "u1", "full_name": "Jean User", "email": "jean@acme-corp.fr"},
]
EXPENSES = [
    {"id": "e1", "amount": "100.00", "expense_date": "2026-07-02", "description": "Taxi",
     "status": "approved", "category_id": "c1", "user_id": "u1"},
    {"id": "e2", "amount": "50.00", "expense_date": "2026-07-05", "description": "Prime",
     "status": "approved", "category_id": "c2", "user_id": "u1"},
    {"id": "e3", "amount": "40.00", "expense_date": "2026-07-08", "description": "Péage",
     "status": "pending", "category_id": "c1", "user_id": "u1"},
    {"id": "e4", "amount": "60.00", "expense_date": "2026-07-09", "description": "Resto",
     "status": "rejected", "category_id": "c1", "user_id": "u1"},
]

PERIOD = "date_from=2026-07-01&date_to=2026-07-31"


def _mock_reports_client(monkeypatch, expenses=None):
    mock_client = MagicMock()
    tables = {
        "companies": MagicMock(),
        "categories": MagicMock(),
        "profiles": MagicMock(),
        "expenses": MagicMock(),
    }
    mock_client.table.side_effect = lambda name: tables[name]
    mock_client.tables = tables

    tables["companies"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[COMPANY]
    )
    tables["categories"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=CATEGORIES
    )
    tables["profiles"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=PROFILES
    )
    tables["expenses"].select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value = SimpleNamespace(
        data=EXPENSES if expenses is None else expenses
    )

    monkeypatch.setattr(reports_service, "get_service_client", lambda: mock_client)
    return mock_client


def test_export_excel(client, as_admin, monkeypatch, silence_audit):
    _mock_reports_client(monkeypatch)

    resp = client.get(f"/reports/export?format=excel&{PERIOD}")

    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]
    assert 'filename="rapport_budgetpilot360_2026-07-01_2026-07-31.xlsx"' in resp.headers["content-disposition"]

    wb = load_workbook(io.BytesIO(resp.content))
    assert wb.sheetnames == ["Résumé", "Dépenses", "Par catégorie"]

    resume = wb["Résumé"]
    assert "Acme" in resume["A1"].value
    assert resume["B5"].value == 150.0  # approuvées : 100 + 50
    assert resume["B6"].value == 40.0  # en attente
    assert resume["B7"].value == 60.0  # rejetées

    depenses = wb["Dépenses"]
    assert depenses.max_row == 5  # entête + 4 dépenses
    assert depenses["E2"].value == 100.0
    assert depenses["F2"].value == "Approuvée"

    cats = wb["Par catégorie"]
    assert cats["A2"].value == "Transport"  # trié par consommé décroissant
    assert cats["C2"].value == 100.0  # seules les approuvées comptent
    assert cats["D3"].value == "—"  # budget prévu à 0 → pas de ratio


def test_export_pdf(client, as_admin, monkeypatch, silence_audit):
    _mock_reports_client(monkeypatch)

    resp = client.get(f"/reports/export?format=pdf&{PERIOD}")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:5] == b"%PDF-"
    assert len(resp.content) > 2000


def test_export_scopes_period_and_company(client, as_admin, monkeypatch, silence_audit):
    mock_client = _mock_reports_client(monkeypatch)

    client.get(f"/reports/export?format=excel&{PERIOD}")

    chain = mock_client.tables["expenses"].select.return_value
    assert chain.eq.call_args.args == ("company_id", as_admin.company_id)
    assert chain.eq.return_value.gte.call_args.args == ("expense_date", "2026-07-01")
    assert chain.eq.return_value.gte.return_value.lte.call_args.args == ("expense_date", "2026-07-31")


def test_export_is_audited(client, as_admin, monkeypatch, silence_audit):
    _mock_reports_client(monkeypatch)

    client.get(f"/reports/export?format=excel&{PERIOD}")

    entry = next(c for c in silence_audit if c["action"] == "report.exported")
    assert entry["details"]["format"] == "excel"
    assert entry["details"]["date_from"] == "2026-07-01"


def test_export_invalid_period(client, as_admin, monkeypatch):
    _mock_reports_client(monkeypatch)

    resp = client.get("/reports/export?format=pdf&date_from=2026-07-31&date_to=2026-07-01")

    assert resp.status_code == 422


def test_export_invalid_format(client, as_admin, monkeypatch):
    _mock_reports_client(monkeypatch)

    resp = client.get(f"/reports/export?format=csv&{PERIOD}")

    assert resp.status_code == 422


def test_export_forbidden_for_user(client, as_user, monkeypatch):
    mock_client = _mock_reports_client(monkeypatch)

    resp = client.get(f"/reports/export?format=pdf&{PERIOD}")

    assert resp.status_code == 403
    mock_client.table.assert_not_called()


def test_export_empty_period(client, as_admin, monkeypatch, silence_audit):
    _mock_reports_client(monkeypatch, expenses=[])

    resp = client.get(f"/reports/export?format=excel&{PERIOD}")

    assert resp.status_code == 200
    wb = load_workbook(io.BytesIO(resp.content))
    assert wb["Résumé"]["B5"].value == 0.0
    assert wb["Dépenses"].max_row >= 1
