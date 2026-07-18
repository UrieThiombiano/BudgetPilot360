"""
Tests unitaires backend : Supabase est mocké (aucun appel réseau).
Les variables d'env sont posées AVANT l'import de app.* (Settings est
instancié à l'import de app.core.config).
"""

import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-unit-tests")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test"
)

import pytest
from fastapi.testclient import TestClient

import app.core.audit as audit_module
from app.core.security import CurrentUser, get_current_user
from app.main import app


@pytest.fixture(autouse=True)
def silence_audit(monkeypatch):
    """Neutralise l'audit log pour TOUTE la suite : aucun appel réseau en test.
    Les tests qui vérifient l'audit inspectent la liste retournée."""
    calls = []
    monkeypatch.setattr(audit_module, "log_action", lambda **kw: calls.append(kw))
    return calls


@pytest.fixture(autouse=True)
def capture_notifications(monkeypatch):
    """Neutralise l'écriture des notifications (best-effort, appel réseau sinon)."""
    import app.modules.notifications.service as notif_module

    calls = []
    monkeypatch.setattr(notif_module, "notify", lambda **kw: calls.append(kw))
    return calls


@pytest.fixture(autouse=True)
def capture_materializations(monkeypatch):
    """Neutralise le catch-up des dépenses automatiques pour TOUTE la suite
    (appel réseau sinon, déclenché par /dashboard/summary et /expenses/mine).
    test_recurring.py teste la vraie logique en capturant la fonction à l'import."""
    import app.modules.recurring.service as recurring_module

    calls = []
    monkeypatch.setattr(
        recurring_module, "materialize_due", lambda company_id: calls.append(company_id)
    )
    return calls


@pytest.fixture(autouse=True)
def capture_threshold_checks(monkeypatch):
    """Neutralise le contrôle de seuils budgétaires pour toute la suite
    (requêtes réseau sinon). test_alerts.py teste la vraie logique en
    appelant directement le module alerts avec un client mocké."""
    import app.modules.budgets.alerts as alerts_module

    calls = []
    monkeypatch.setattr(
        alerts_module, "check_after_approval", lambda **kw: calls.append(kw)
    )
    return calls

ADMIN = CurrentUser(
    id="00000000-0000-0000-0000-0000000000a1",
    email="admin@acme-corp.fr",
    company_id="11111111-1111-1111-1111-111111111111",
    role="admin",
)

SIMPLE_USER = CurrentUser(
    id="00000000-0000-0000-0000-0000000000b2",
    email="user@acme-corp.fr",
    company_id="11111111-1111-1111-1111-111111111111",
    role="user",
)

NEW_USER_NO_COMPANY = CurrentUser(
    id="00000000-0000-0000-0000-0000000000c3",
    email="new@acme-corp.fr",
    company_id=None,
    role="user",
)

SUPER_ADMIN = CurrentUser(
    id="00000000-0000-0000-0000-0000000000d4",
    email="superadmin@pukri.fr",
    company_id=None,  # le super_admin (Pukri) n'appartient à aucun tenant
    role="super_admin",
)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def as_admin():
    app.dependency_overrides[get_current_user] = lambda: ADMIN
    yield ADMIN
    app.dependency_overrides.clear()


@pytest.fixture
def as_user():
    app.dependency_overrides[get_current_user] = lambda: SIMPLE_USER
    yield SIMPLE_USER
    app.dependency_overrides.clear()


@pytest.fixture
def as_new_user():
    app.dependency_overrides[get_current_user] = lambda: NEW_USER_NO_COMPANY
    yield NEW_USER_NO_COMPANY
    app.dependency_overrides.clear()


@pytest.fixture
def as_super_admin():
    app.dependency_overrides[get_current_user] = lambda: SUPER_ADMIN
    yield SUPER_ADMIN
    app.dependency_overrides.clear()
