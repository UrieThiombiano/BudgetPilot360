"""Tests de la couche auth (tâche 1.1 côté backend) : validation des JWT Supabase
et résolution du profil, via GET /profiles/me."""

import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import jwt

import app.core.security as security_module

JWT_SECRET = "test-jwt-secret-for-unit-tests"  # même valeur que dans conftest.py
USER_ID = "00000000-0000-0000-0000-0000000000d4"


def _make_token(*, secret=JWT_SECRET, audience="authenticated", expired=False):
    now = int(time.time())
    payload = {
        "sub": USER_ID,
        "email": "jwt@acme-corp.fr",
        "aud": audience,
        "iat": now - 60,
        "exp": now - 30 if expired else now + 3600,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def _mock_profile_lookup(monkeypatch, *, rows):
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=rows
    )
    monkeypatch.setattr(security_module, "get_service_client", lambda: mock_client)
    return mock_client


def test_me_with_valid_token(client, monkeypatch):
    _mock_profile_lookup(
        monkeypatch,
        rows=[{"company_id": "11111111-1111-1111-1111-111111111111", "role": "admin"}],
    )

    resp = client.get(
        "/profiles/me",
        headers={"Authorization": f"Bearer {_make_token()}"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == USER_ID
    assert body["email"] == "jwt@acme-corp.fr"
    assert body["role"] == "admin"


def test_me_rejects_bad_signature(client, monkeypatch):
    _mock_profile_lookup(monkeypatch, rows=[])

    resp = client.get(
        "/profiles/me",
        headers={"Authorization": f"Bearer {_make_token(secret='mauvais-secret')}"},
    )

    assert resp.status_code == 401


def test_me_rejects_expired_token(client, monkeypatch):
    _mock_profile_lookup(monkeypatch, rows=[])

    resp = client.get(
        "/profiles/me",
        headers={"Authorization": f"Bearer {_make_token(expired=True)}"},
    )

    assert resp.status_code == 401


def test_me_rejects_wrong_audience(client, monkeypatch):
    _mock_profile_lookup(monkeypatch, rows=[])

    resp = client.get(
        "/profiles/me",
        headers={"Authorization": f"Bearer {_make_token(audience='autre-app')}"},
    )

    assert resp.status_code == 401


def test_me_without_token(client):
    resp = client.get("/profiles/me")
    assert resp.status_code in (401, 403)


def test_me_suspended_company_is_402(client, monkeypatch):
    """Entreprise suspendue par Pukri → plus aucun accès pour ses membres."""
    _mock_profile_lookup(
        monkeypatch,
        rows=[
            {
                "company_id": "11111111-1111-1111-1111-111111111111",
                "role": "admin",
                "companies": {"subscription_status": "suspended"},
            }
        ],
    )

    resp = client.get(
        "/profiles/me",
        headers={"Authorization": f"Bearer {_make_token()}"},
    )

    assert resp.status_code == 402
    assert "suspendu" in resp.json()["detail"]


def test_me_removed_user_is_403(client, monkeypatch):
    """Utilisateur retiré (désactivation douce) : bloqué même avec un JWT encore valide."""
    _mock_profile_lookup(
        monkeypatch,
        rows=[
            {
                "company_id": "11111111-1111-1111-1111-111111111111",
                "role": "user",
                "removed_at": "2026-07-01T00:00:00+00:00",
                "companies": {"subscription_status": "active"},
            }
        ],
    )

    resp = client.get(
        "/profiles/me",
        headers={"Authorization": f"Bearer {_make_token()}"},
    )

    assert resp.status_code == 403
    assert "désactivé" in resp.json()["detail"]


def test_me_missing_profile_is_403(client, monkeypatch):
    _mock_profile_lookup(monkeypatch, rows=[])

    resp = client.get(
        "/profiles/me",
        headers={"Authorization": f"Bearer {_make_token()}"},
    )

    assert resp.status_code == 403


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
