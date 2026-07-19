"""Tests de l'espace Super Admin (Phase 10.1) : liste entreprises, stats
globales, activation/suspension d'abonnement, RBAC strict super_admin."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import app.modules.platform.service as platform_service

COMPANIES = [
    {"id": "co1", "name": "Acme", "created_at": "2026-07-01T10:00:00+00:00", "subscription_status": "active", "owner_id": "a1"},
    {"id": "co2", "name": "Globex", "created_at": "2026-06-01T10:00:00+00:00", "subscription_status": "suspended", "owner_id": "a4"},
]
PROFILES = [
    {"id": "a1", "company_id": "co1", "role": "admin", "removed_at": None},  # propriétaire Acme
    {"id": "u1", "company_id": "co1", "role": "user", "removed_at": None},
    {"id": "u2", "company_id": "co1", "role": "user", "removed_at": None},
    {"id": "a4", "company_id": "co2", "role": "admin", "removed_at": None},  # propriétaire Globex
    {"id": "sa", "company_id": None, "role": "super_admin", "removed_at": None},  # Pukri, hors tenants
]
EXPENSES = [
    {"amount": "100.00", "status": "approved", "company_id": "co1", "created_at": "2026-07-15T09:00:00+00:00"},
    {"amount": "50.00", "status": "approved", "company_id": "co1", "created_at": "2026-07-17T09:00:00+00:00"},
    {"amount": "999.00", "status": "pending", "company_id": "co2", "created_at": "2026-05-01T09:00:00+00:00"},
    {"amount": "20.00", "status": "rejected", "company_id": "co1", "created_at": "2026-07-10T09:00:00+00:00"},
]
AI_AUDIT = [{"company_id": "co1"}, {"company_id": "co1"}]  # 2 appels IA ce mois (Acme)
REFERRALS = [{"referral_source": "Bouche-à-oreille"}, {"referral_source": None}]


def _mock_platform_client(monkeypatch):
    mock_client = MagicMock()
    tables = {
        "companies": MagicMock(),
        "profiles": MagicMock(),
        "expenses": MagicMock(),
        "revenues": MagicMock(),
        "audit_logs": MagicMock(),
        "registration_requests": MagicMock(),
        # Tables purgées par la suppression définitive d'un tenant
        "expense_comments": MagicMock(),
        "notifications": MagicMock(),
        "recurring_expenses": MagicMock(),
        "recurring_revenues": MagicMock(),
        "categories": MagicMock(),
    }
    mock_client.table.side_effect = lambda name: tables[name]
    mock_client.tables = tables

    # Suppression définitive : lookup entreprise + profils du tenant, Storage vide
    tables["companies"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[COMPANIES[0]]
    )
    tables["profiles"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[p for p in PROFILES if p["company_id"] == "co1"]
    )
    mock_client.storage.from_.return_value.list.return_value = []

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
    tables["revenues"].select.return_value.execute.return_value = SimpleNamespace(data=[])
    # appels IA du mois : audit_logs.select().eq(action).gte(created_at).execute()
    tables["audit_logs"].select.return_value.eq.return_value.gte.return_value.execute.return_value = SimpleNamespace(
        data=AI_AUDIT
    )
    tables["registration_requests"].select.return_value.execute.return_value = SimpleNamespace(
        data=REFERRALS
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
    # Insights analyst : sièges (hors propriétaire), IA du mois, dernière activité
    assert acme["seats_used"] == 2  # u1 + u2 (le propriétaire a1 ne compte pas)
    assert acme["max_seats"] == 3
    assert acme["ai_calls_month"] == 2
    assert acme["last_activity"] == "2026-07-17T09:00:00+00:00"  # la plus récente
    globex = next(c for c in body if c["name"] == "Globex")
    assert globex["subscription_status"] == "suspended"
    assert globex["users_count"] == 1
    assert globex["seats_used"] == 0  # seul le propriétaire — aucun collaborateur
    assert globex["ai_calls_month"] == 0
    assert globex["last_activity"] == "2026-05-01T09:00:00+00:00"


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
    assert body["ai_calls_month"] == 2
    assert body["referral_sources"] == {"Bouche-à-oreille": 1, "Non renseigné": 1}


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


def test_delete_company_purges_everything(client, as_super_admin, monkeypatch):
    """Suppression DÉFINITIVE d'un tenant : données métier, profils, comptes
    Auth, entreprise — dans l'ordre imposé par les FK."""
    mock_client = _mock_platform_client(monkeypatch)

    resp = client.delete("/platform/companies/co1")

    assert resp.status_code == 204
    # Références sans cascade détachées avant la purge
    assert {"owner_id": None} in [
        c.args[0] for c in mock_client.tables["companies"].update.call_args_list
    ]
    assert {"company_id": None} in [
        c.args[0] for c in mock_client.tables["registration_requests"].update.call_args_list
    ]
    # Données métier purgées (RESTRICT vers profiles obligent : avant les profils)
    for table in (
        "expense_comments", "notifications", "expenses", "revenues",
        "recurring_expenses", "recurring_revenues", "categories", "profiles",
    ):
        mock_client.tables[table].delete.assert_called_once()
    # Chaque compte Auth du tenant est supprimé (cascade → profil)
    deleted_auth = {c.args[0] for c in mock_client.auth.admin.delete_user.call_args_list}
    assert deleted_auth == {"a1", "u1", "u2"}
    # L'entreprise part en dernier
    mock_client.tables["companies"].delete.assert_called_once()


def test_delete_company_not_found(client, as_super_admin, monkeypatch):
    mock_client = _mock_platform_client(monkeypatch)
    mock_client.tables["companies"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )

    resp = client.delete("/platform/companies/inconnue")

    assert resp.status_code == 404
    mock_client.tables["companies"].delete.assert_not_called()


def test_platform_forbidden_for_admin(client, as_admin, monkeypatch):
    """Un admin d'entreprise n'accède JAMAIS à l'espace plateforme (RBAC explicite)."""
    mock_client = _mock_platform_client(monkeypatch)

    assert client.get("/platform/companies").status_code == 403
    assert client.get("/platform/stats").status_code == 403
    assert (
        client.post("/platform/companies/co1/subscription", json={"action": "suspend"}).status_code
        == 403
    )
    assert client.delete("/platform/companies/co1").status_code == 403
    mock_client.table.assert_not_called()


def test_platform_forbidden_for_user(client, as_user, monkeypatch):
    mock_client = _mock_platform_client(monkeypatch)

    assert client.get("/platform/companies").status_code == 403
    mock_client.table.assert_not_called()
