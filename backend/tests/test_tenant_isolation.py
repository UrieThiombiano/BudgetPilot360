"""Isolation multi-tenant (Phase 12.1) — la garantie n° 1 de la plateforme.

Chaque requête métier DOIT être scopée sur le company_id de l'APPELANT (résolu
depuis son JWT via profiles), jamais sur une valeur venant du payload ou d'un
paramètre d'URL. Ces tests capturent les arguments passés au client Supabase
et vérifient ce scoping sur les endpoints critiques. La RLS Postgres reste le
filet de sécurité en profondeur ; ici on prouve la première couche.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

import app.core.transactions as tx_service
import app.modules.categories.service as cat_service
import app.modules.dashboard.service as dash_service
import app.modules.expenses.service as exp_service
from tests.conftest import ADMIN, SIMPLE_USER


def _client_with_tables(monkeypatch, module, table_names):
    mock_client = MagicMock()
    tables = {name: MagicMock() for name in table_names}
    mock_client.table.side_effect = lambda name: tables[name]
    monkeypatch.setattr(module, "get_service_client", lambda: mock_client)
    # Le CRUD dépenses/recettes vit dans le service partagé : on l'aiguille aussi
    # vers le mock (sans effet pour les endpoints qui ne l'utilisent pas).
    monkeypatch.setattr(tx_service, "get_service_client", lambda: mock_client)
    return tables


def _eq_calls(mock_eq_chain_root):
    """Aplati les couples (colonne, valeur) passés aux .eq() chaînés."""
    calls = []
    node = mock_eq_chain_root
    for _ in range(5):
        if node.eq.call_args is None:
            break
        calls.append(node.eq.call_args.args)
        node = node.eq.return_value
    return calls


def test_categories_list_scoped_to_caller_company(client, as_user, monkeypatch):
    tables = _client_with_tables(monkeypatch, cat_service, ["categories", "expenses", "revenues"])
    tables["categories"].select.return_value.eq.return_value.order.return_value.execute.return_value = SimpleNamespace(data=[])
    tables["expenses"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])
    tables["revenues"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])

    client.get("/categories")

    assert tables["categories"].select.return_value.eq.call_args.args == (
        "company_id",
        SIMPLE_USER.company_id,
    )


def test_my_expenses_scoped_to_caller_company_and_user(client, as_user, monkeypatch):
    tables = _client_with_tables(monkeypatch, exp_service, ["expenses", "categories"])
    tables["expenses"].select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = SimpleNamespace(data=[])
    tables["categories"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])

    client.get("/expenses/mine")

    eqs = _eq_calls(tables["expenses"].select.return_value)
    assert ("company_id", SIMPLE_USER.company_id) in eqs  # jamais une autre entreprise
    assert ("user_id", SIMPLE_USER.id) in eqs  # un user ne voit que SES dépenses


def test_create_expense_forces_caller_company(client, as_user, monkeypatch):
    """Le company_id inséré vient du JWT de l'appelant — un payload malveillant
    contenant un autre company_id est ignoré par le schéma Pydantic."""
    tables = _client_with_tables(monkeypatch, exp_service, ["expenses", "categories"])
    tables["categories"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "c1", "name": "Transport"}]
    )
    created = {
        "id": "e1",
        "amount": 100,
        "expense_date": "2026-07-17",
        "status": "pending",
        "category_id": "c1",
    }
    tables["expenses"].insert.return_value.execute.return_value = SimpleNamespace(data=[created])

    resp = client.post(
        "/expenses",
        json={
            "amount": 100,
            "category_id": "c1",
            "company_id": "99999999-9999-9999-9999-999999999999",  # tentative d'injection
        },
    )

    assert resp.status_code == 201
    payload = tables["expenses"].insert.call_args.args[0]
    assert payload["company_id"] == SIMPLE_USER.company_id
    assert payload["user_id"] == SIMPLE_USER.id


def test_review_update_scoped_to_reviewer_company(client, as_admin, monkeypatch, capture_notifications):
    tables = _client_with_tables(monkeypatch, exp_service, ["expenses"])
    reviewed = {
        "id": "e1",
        "amount": "10.00",
        "expense_date": "2026-07-17",
        "status": "approved",
        "category_id": "c1",
        "user_id": SIMPLE_USER.id,
    }
    tables["expenses"].update.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[reviewed]
    )

    resp = client.post("/expenses/e1/review", json={"action": "approve"})

    assert resp.status_code == 200
    eqs = _eq_calls(tables["expenses"].update.return_value)
    # l'UPDATE est verrouillé sur l'entreprise du reviewer + le statut pending
    assert ("company_id", ADMIN.company_id) in eqs
    assert ("status", "pending") in eqs


def test_dashboard_scoped_to_caller_company(client, as_admin, monkeypatch):
    tables = _client_with_tables(monkeypatch, dash_service, ["companies", "categories", "expenses", "revenues"])
    tables["companies"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": ADMIN.company_id, "name": "Acme", "annual_budget": "0"}]
    )
    tables["categories"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])
    tables["expenses"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])
    tables["revenues"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])

    client.get("/dashboard/summary")

    assert tables["companies"].select.return_value.eq.call_args.args == ("id", ADMIN.company_id)
    assert tables["categories"].select.return_value.eq.call_args.args == (
        "company_id",
        ADMIN.company_id,
    )
    assert tables["expenses"].select.return_value.eq.call_args.args == (
        "company_id",
        ADMIN.company_id,
    )
