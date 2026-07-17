"""Tests de l'espace Super Admin (Phase 10.1) : liste entreprises, stats
globales, activation/suspension d'abonnement, RBAC strict super_admin."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import app.modules.platform.service as platform_service

COMPANIES = [
    {"id": "co1", "name": "Acme", "created_at": "2026-07-01T10:00:00+00:00", "subscription_status": "active"},
    {"id": "co2", "name": "Globex", "created_at": "2026-06-01T10:00:00+00:00", "subscription_status": "suspended"},
]
PROFILES = [
    {"company_id": "co1", "role": "admin"},
    {"company_id": "co1", "role": "user"},
    {"company_id": "co1", "role": "user"},
    {"company_id": "co2", "role": "admin"},
    {"company_id": None, "role": "super_admin"},  # Pukri, hors tenants
]
EXPENSES = [
    {"amount": "100.00", "status": "approved"},
    {"amount": "50.00", "status": "approved"},
    {"amount": "999.00", "status": "pending"},
    {"amount": "20.00", "status": "rejected"},
]


def _mock_platform_client(monkeypatch):
    mock_client = MagicMock()
    tables = {"companies": MagicMock(), "profiles": MagicMock(), "expenses": MagicMock()}
    mock_client.table.side_effect = lambda name: tables[name]
    mock_client.tables = tables

    tables["companies"].select.return_value.order.return_value.execute.return_value = SimpleNamespace(
        data=COMPANIES
    )
    tables["companies"].select.return_value.execute.return_value = SimpleNamespace(
        data=COMPANIES
    )
    tables["profiles"].select.return_value.execute.return_value = SimpleNamespace(
        data=PROFILES
    )
    tables["expenses"].select.return_value.execute.return_value = SimpleNamespace(
        data=EXPENSES
    )
    tables["companies"].update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{**COMPANIES[1], "subscription_status": "active"}]
    )

    monkeypatch.setattr(platform_service, "get_service_client", lambda: mock_client)
    # les stats plateforme agrègent aussi les demandes d'inscription
    import app.modules.registration.service as reg_service

    monkeypatch.setattr(
        reg_service,
        "get_stats",
        lambda: {"pending": 2, "approved": 1, "rejected": 0, "total": 3, "new_today": 1},
    )
    return mock_client


def test_list_companies(client, as_super_admin, monkeypatch):
    _mock_platform_client(monkeypatch)

    resp = client.get("/platform/companies")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    acme = next(c for c in body if c["name"] == "Acme")
    assert acme["users_count"] == 3  # le super_admin sans entreprise ne compte pas
    assert acme["subscription_status"] == "active"
    globex = next(c for c in body if c["name"] == "Globex")
    assert globex["subscription_status"] == "suspended"
    assert globex["users_count"] == 1


def test_stats(client, as_super_admin, monkeypatch):
    _mock_platform_client(monkeypatch)

    resp = client.get("/platform/stats")

    assert resp.status_code == 200
    body = resp.json()
    assert body["companies_count"] == 2
    assert body["active_companies"] == 1
    assert body["suspended_companies"] == 1
    assert body["users_count"] == 4  # super_admin exclu
    assert body["expenses_count"] == 4
    assert body["approved_amount"] == 150.0  # volume traité = approuvées uniquement
    assert body["pending_requests"] == 2
    assert body["new_requests_today"] == 1
    assert body["plans"] == {"starter": 2}  # défaut quand la colonne est absente


def test_suspend_subscription_audited(client, as_super_admin, monkeypatch, silence_audit):
    mock_client = _mock_platform_client(monkeypatch)
    mock_client.tables["companies"].update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{**COMPANIES[0], "subscription_status": "suspended"}]
    )

    resp = client.post("/platform/companies/co1/subscription", json={"action": "suspend"})

    assert resp.status_code == 200
    assert resp.json()["subscription_status"] == "suspended"
    update_payload = mock_client.tables["companies"].update.call_args.args[0]
    assert update_payload == {"subscription_status": "suspended"}
    entry = next(c for c in silence_audit if c["action"] == "subscription.suspended")
    assert entry["company_id"] == "co1"  # audité sur l'entreprise CIBLE
    assert entry["actor_id"] == as_super_admin.id


def test_activate_subscription(client, as_super_admin, monkeypatch, silence_audit):
    _mock_platform_client(monkeypatch)

    resp = client.post("/platform/companies/co2/subscription", json={"action": "activate"})

    assert resp.status_code == 200
    assert resp.json()["subscription_status"] == "active"
    assert any(c["action"] == "subscription.activated" for c in silence_audit)


def test_subscription_company_not_found(client, as_super_admin, monkeypatch):
    mock_client = _mock_platform_client(monkeypatch)
    mock_client.tables["companies"].update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )

    resp = client.post("/platform/companies/inconnue/subscription", json={"action": "suspend"})

    assert resp.status_code == 404


def test_subscription_invalid_action(client, as_super_admin, monkeypatch):
    _mock_platform_client(monkeypatch)

    resp = client.post("/platform/companies/co1/subscription", json={"action": "delete"})

    assert resp.status_code == 422


def test_platform_forbidden_for_admin(client, as_admin, monkeypatch):
    """Un admin d'entreprise n'accède JAMAIS à l'espace plateforme (RBAC explicite)."""
    mock_client = _mock_platform_client(monkeypatch)

    assert client.get("/platform/companies").status_code == 403
    assert client.get("/platform/stats").status_code == 403
    assert (
        client.post("/platform/companies/co1/subscription", json={"action": "suspend"}).status_code
        == 403
    )
    mock_client.table.assert_not_called()


def test_platform_forbidden_for_user(client, as_user, monkeypatch):
    mock_client = _mock_platform_client(monkeypatch)

    assert client.get("/platform/companies").status_code == 403
    mock_client.table.assert_not_called()
