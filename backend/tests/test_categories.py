"""Tests du module Budget & Catégories (tâche 2.1) : CRUD, RBAC, consommé, audit."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import app.modules.categories.service as cat_service
import app.modules.companies.service as companies_service

CAT_ID = "c1000000-0000-0000-0000-000000000001"

CATEGORIES = [
    {"id": CAT_ID, "name": "Transport", "planned_budget": "1000.00", "created_at": "2026-07-16T10:00:00+00:00"},
    {"id": "c2", "name": "Salaires", "planned_budget": "5000.00", "created_at": "2026-07-16T11:00:00+00:00"},
]

APPROVED_EXPENSES = [
    {"category_id": CAT_ID, "amount": "150.50"},
    {"category_id": CAT_ID, "amount": "49.50"},
]


def _mock_categories_client(monkeypatch):
    """Chaînes utilisées par le service categories :
    - liste :   table('categories').select().eq().order().execute()
    - dépenses: table('expenses').select().eq().eq().execute()
    - insert :  table().insert().execute()
    - update :  table().update().eq().eq().execute()
    - delete :  table().delete().eq().eq().execute()
    """
    mock_client = MagicMock()

    def table_side_effect(name):
        return {
            "categories": mock_client.categories,
            "expenses": mock_client.expenses,
            "revenues": mock_client.revenues,
        }[name]

    mock_client.table.side_effect = table_side_effect
    mock_client.categories.select.return_value.eq.return_value.order.return_value.execute.return_value = SimpleNamespace(
        data=CATEGORIES
    )
    mock_client.expenses.select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=APPROVED_EXPENSES
    )
    # Le consommé fusionne désormais dépenses ET recettes approuvées.
    mock_client.revenues.select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )
    mock_client.categories.insert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "c3", "name": "Carburant", "planned_budget": 800, "created_at": None}]
    )
    mock_client.categories.update.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": CAT_ID, "name": "Transports", "planned_budget": 1200, "created_at": None}]
    )
    mock_client.categories.delete.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": CAT_ID, "name": "Transport"}]
    )

    monkeypatch.setattr(cat_service, "get_service_client", lambda: mock_client)
    return mock_client


def test_list_categories_with_consumed(client, as_user, monkeypatch):
    _mock_categories_client(monkeypatch)

    resp = client.get("/categories")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    transport = next(c for c in body if c["name"] == "Transport")
    assert transport["consumed"] == 200.0  # 150.50 + 49.50
    assert transport["planned_budget"] == 1000.0
    salaires = next(c for c in body if c["name"] == "Salaires")
    assert salaires["consumed"] == 0.0


def test_create_category_admin(client, as_admin, monkeypatch, silence_audit):
    mock_client = _mock_categories_client(monkeypatch)

    resp = client.post("/categories", json={"name": "Carburant", "planned_budget": 800})

    assert resp.status_code == 201
    assert resp.json()["name"] == "Carburant"
    insert_payload = mock_client.categories.insert.call_args.args[0]
    assert insert_payload["company_id"] == as_admin.company_id
    assert any(c["action"] == "category.created" for c in silence_audit)


def test_list_categories_includes_type(client, as_user, monkeypatch):
    _mock_categories_client(monkeypatch)

    body = client.get("/categories").json()

    assert all("type" in c for c in body)
    assert body[0]["type"] == "expense"  # défaut rétro-compatible


def test_create_revenue_category(client, as_admin, monkeypatch, silence_audit):
    mock_client = _mock_categories_client(monkeypatch)

    resp = client.post(
        "/categories",
        json={"name": "Ventes", "planned_budget": 2000, "type": "revenue"},
    )

    assert resp.status_code == 201
    assert resp.json()["type"] == "revenue"
    insert_payload = mock_client.categories.insert.call_args.args[0]
    assert insert_payload["type"] == "revenue"


def test_create_category_forbidden_for_user(client, as_user, monkeypatch):
    mock_client = _mock_categories_client(monkeypatch)

    resp = client.post("/categories", json={"name": "Hack", "planned_budget": 1})

    assert resp.status_code == 403
    mock_client.categories.insert.assert_not_called()


def test_create_category_duplicate_name(client, as_admin, monkeypatch):
    mock_client = _mock_categories_client(monkeypatch)
    mock_client.categories.insert.return_value.execute.side_effect = Exception(
        'duplicate key value violates unique constraint (23505)'
    )

    resp = client.post("/categories", json={"name": "Transport", "planned_budget": 10})

    assert resp.status_code == 409


def test_update_category(client, as_admin, monkeypatch, silence_audit):
    _mock_categories_client(monkeypatch)

    resp = client.patch(f"/categories/{CAT_ID}", json={"planned_budget": 1200})

    assert resp.status_code == 200
    assert resp.json()["planned_budget"] == 1200.0
    assert any(c["action"] == "category.updated" for c in silence_audit)


def test_update_category_not_found(client, as_admin, monkeypatch):
    mock_client = _mock_categories_client(monkeypatch)
    mock_client.categories.update.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )

    resp = client.patch("/categories/inconnu", json={"planned_budget": 5})

    assert resp.status_code == 404


def test_delete_category(client, as_admin, monkeypatch, silence_audit):
    _mock_categories_client(monkeypatch)

    resp = client.delete(f"/categories/{CAT_ID}")

    assert resp.status_code == 204
    assert any(c["action"] == "category.deleted" for c in silence_audit)


def test_delete_category_with_expenses_blocked(client, as_admin, monkeypatch):
    mock_client = _mock_categories_client(monkeypatch)
    mock_client.categories.delete.return_value.eq.return_value.eq.return_value.execute.side_effect = Exception(
        'update or delete violates foreign key constraint (23503)'
    )

    resp = client.delete(f"/categories/{CAT_ID}")

    assert resp.status_code == 409
    assert "dépenses" in resp.json()["detail"]


def test_delete_category_forbidden_for_user(client, as_user, monkeypatch):
    mock_client = _mock_categories_client(monkeypatch)

    resp = client.delete(f"/categories/{CAT_ID}")

    assert resp.status_code == 403
    mock_client.categories.delete.assert_not_called()


# --- /companies/me ---


def _mock_company_client(monkeypatch):
    mock_client = MagicMock()
    company = {"id": "11111111-1111-1111-1111-111111111111", "name": "Acme", "annual_budget": "50000.00", "created_at": None}
    mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[company]
    )
    mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{**company, "annual_budget": 75000}]
    )
    monkeypatch.setattr(companies_service, "get_service_client", lambda: mock_client)
    return mock_client


def test_get_my_company(client, as_user, monkeypatch):
    _mock_company_client(monkeypatch)

    resp = client.get("/companies/me")

    assert resp.status_code == 200
    assert resp.json()["annual_budget"] == 50000.0


def test_update_annual_budget_admin_audited(client, as_admin, monkeypatch, silence_audit):
    _mock_company_client(monkeypatch)

    resp = client.patch("/companies/me", json={"annual_budget": 75000})

    assert resp.status_code == 200
    assert resp.json()["annual_budget"] == 75000.0
    assert any(c["action"] == "company.budget_updated" for c in silence_audit)


def test_update_company_forbidden_for_user(client, as_user, monkeypatch):
    mock_client = _mock_company_client(monkeypatch)

    resp = client.patch("/companies/me", json={"annual_budget": 1})

    assert resp.status_code == 403
    mock_client.table.return_value.update.assert_not_called()


def test_update_company_negative_budget_rejected(client, as_admin, monkeypatch):
    _mock_company_client(monkeypatch)

    resp = client.patch("/companies/me", json={"annual_budget": -5})

    assert resp.status_code == 422
