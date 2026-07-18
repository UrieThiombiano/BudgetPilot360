"""Tests des demandes d'inscription (RegistrationRequest → Validation → Company).

La règle d'architecture FONDAMENTALE est prouvée ici : le formulaire public ne
crée jamais de tenant ni de compte ; seule la validation super_admin le fait.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

import app.modules.registration.service as reg_service

SUBMIT_PAYLOAD = {
    "company_name": "Faso Distribution SARL",
    "industry": "Commerce",
    "contact_name": "Awa Ouédraogo",
    "job_title": "Directrice Générale",
    "email": "direction@faso-distribution.bf",
    "phone": "+226 70 00 00 00",
    "city": "Ouagadougou",
    "employees_count": 12,
    "message": "Nous cherchons un outil de suivi budgétaire.",
}

PENDING_ROW = {
    "id": "r1",
    **{k: v for k, v in SUBMIT_PAYLOAD.items()},
    "status": "pending",
    "plan": None,
    "subscription_months": None,
    "internal_note": None,
    "rejection_reason": None,
    "company_id": None,
    "reviewed_at": None,
    "created_at": "2026-07-17T09:00:00+00:00",
}


def _mock_reg_client(monkeypatch):
    mock_client = MagicMock()
    tables = {
        "registration_requests": MagicMock(),
        "companies": MagicMock(),
        "profiles": MagicMock(),
    }
    mock_client.table.side_effect = lambda name: tables[name]
    mock_client.tables = tables
    reg = tables["registration_requests"]

    # dedupe : select().eq().eq().execute()
    reg.select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])
    # insert
    reg.insert.return_value.execute.return_value = SimpleNamespace(data=[PENDING_ROW])
    # get par id : select().eq().execute()
    reg.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[PENDING_ROW])
    # liste : select().order().execute() (+ .eq optionnel)
    reg.select.return_value.order.return_value.execute.return_value = SimpleNamespace(data=[PENDING_ROW])
    reg.select.return_value.order.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[PENDING_ROW])
    # revue : update().eq().eq().execute()
    reg.update.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{**PENDING_ROW, "status": "approved"}]
    )
    # stats : select().execute()
    reg.select.return_value.execute.return_value = SimpleNamespace(
        data=[
            {"status": "pending", "created_at": "2026-07-17T08:00:00+00:00"},
            {"status": "rejected", "created_at": "2026-07-01T08:00:00+00:00"},
        ]
    )

    tables["companies"].insert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "co-new", "name": "Faso Distribution SARL"}]
    )
    tables["companies"].delete.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])
    tables["profiles"].upsert.return_value.execute.return_value = SimpleNamespace(data=[])
    mock_client.auth.admin.invite_user_by_email.return_value = SimpleNamespace(
        user=SimpleNamespace(id="owner-id")
    )

    monkeypatch.setattr(reg_service, "get_service_client", lambda: mock_client)
    return mock_client


# --- Dépôt public ---


def test_submit_is_public_and_creates_no_tenant(client, monkeypatch):
    mock_client = _mock_reg_client(monkeypatch)

    resp = client.post("/registration/requests", json=SUBMIT_PAYLOAD)  # AUCUN token

    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"
    # Règle fondamentale : ni tenant, ni compte à ce stade
    table_names = [c.args[0] for c in mock_client.table.call_args_list]
    assert "companies" not in table_names
    assert "profiles" not in table_names
    mock_client.auth.admin.invite_user_by_email.assert_not_called()


def test_submit_duplicate_pending_email(client, monkeypatch):
    mock_client = _mock_reg_client(monkeypatch)
    mock_client.tables["registration_requests"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "r0"}]
    )

    resp = client.post("/registration/requests", json=SUBMIT_PAYLOAD)

    assert resp.status_code == 409


def test_submit_validates_payload(client, monkeypatch):
    _mock_reg_client(monkeypatch)

    resp = client.post(
        "/registration/requests", json={**SUBMIT_PAYLOAD, "email": "pas-un-email"}
    )

    assert resp.status_code == 422


def test_submit_requires_job_title(client, monkeypatch):
    """Le rôle du demandeur dans son entreprise est OBLIGATOIRE : c'est son
    libellé affiché partout (à la place de « Admin »)."""
    _mock_reg_client(monkeypatch)

    without_job = {k: v for k, v in SUBMIT_PAYLOAD.items() if k != "job_title"}
    assert client.post("/registration/requests", json=without_job).status_code == 422


# --- Consultation super_admin ---


def test_list_and_stats_super_admin_only(client, as_admin, monkeypatch):
    _mock_reg_client(monkeypatch)

    assert client.get("/registration/requests").status_code == 403
    assert client.get("/registration/stats").status_code == 403


def test_list_requests(client, as_super_admin, monkeypatch):
    _mock_reg_client(monkeypatch)

    resp = client.get("/registration/requests")

    assert resp.status_code == 200
    assert resp.json()[0]["company_name"] == "Faso Distribution SARL"


def test_stats(client, as_super_admin, monkeypatch):
    monkeypatch.setattr(reg_service, "get_service_client", lambda: _mock_reg_client(monkeypatch))
    import datetime

    resp = client.get("/registration/stats")

    assert resp.status_code == 200
    body = resp.json()
    assert body["pending"] == 1
    assert body["rejected"] == 1
    assert body["total"] == 2
    # new_today dépend de la date réelle : cohérence simple
    assert 0 <= body["new_today"] <= 2


# --- Refus ---


def test_reject_archives_without_tenant(client, as_super_admin, monkeypatch):
    mock_client = _mock_reg_client(monkeypatch)
    mock_client.tables["registration_requests"].update.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{**PENDING_ROW, "status": "rejected", "rejection_reason": "Hors cible"}]
    )

    resp = client.post(
        "/registration/requests/r1/review",
        json={"action": "reject", "rejection_reason": "Hors cible"},
    )

    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
    update_payload = mock_client.tables["registration_requests"].update.call_args.args[0]
    assert update_payload["rejection_reason"] == "Hors cible"
    # aucun tenant créé
    assert not mock_client.tables["companies"].insert.called


def test_review_already_processed(client, as_super_admin, monkeypatch):
    mock_client = _mock_reg_client(monkeypatch)
    mock_client.tables["registration_requests"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{**PENDING_ROW, "status": "approved"}]
    )

    resp = client.post(
        "/registration/requests/r1/review", json={"action": "reject"}
    )

    assert resp.status_code == 409


# --- Approbation ---


def test_approve_creates_tenant_and_invites_owner(client, as_super_admin, monkeypatch, silence_audit):
    mock_client = _mock_reg_client(monkeypatch)

    resp = client.post(
        "/registration/requests/r1/review",
        json={
            "action": "approve",
            "plan": "standard",
            "subscription_months": 12,
            "internal_note": "Contact tel 16/07 — OK",
        },
    )

    assert resp.status_code == 200

    # 1) tenant créé avec offre + échéance
    company_payload = mock_client.tables["companies"].insert.call_args.args[0]
    assert company_payload["name"] == "Faso Distribution SARL"
    assert company_payload["plan"] == "standard"
    assert company_payload["subscription_status"] == "active"
    assert company_payload["subscription_ends_at"]  # date ISO à +12 mois

    # 2) Organization Owner invité — JAMAIS de mot de passe
    invite_args = mock_client.auth.admin.invite_user_by_email.call_args
    assert invite_args.args[0] == "direction@faso-distribution.bf"
    assert "password" not in invite_args.args[1]
    assert invite_args.args[1]["redirect_to"].endswith("/set-password")

    # 3) profil owner = admin du nouveau tenant, avec son rôle d'entreprise
    #    (job_title) et le marquage propriétaire (companies.owner_id)
    profile_payload = mock_client.tables["profiles"].upsert.call_args.args[0]
    assert profile_payload["role"] == "admin"
    assert profile_payload["company_id"] == "co-new"
    assert profile_payload["job_title"] == "Directrice Générale"
    owner_update = mock_client.tables["companies"].update.call_args.args[0]
    assert owner_update == {"owner_id": "owner-id"}

    # 4) demande approuvée et rattachée + audit
    update_payload = mock_client.tables["registration_requests"].update.call_args.args[0]
    assert update_payload["status"] == "approved"
    assert update_payload["company_id"] == "co-new"
    assert any(c["action"] == "registration.approved" for c in silence_audit)


def test_approve_requires_plan_and_duration(client, as_super_admin, monkeypatch):
    mock_client = _mock_reg_client(monkeypatch)

    resp = client.post(
        "/registration/requests/r1/review", json={"action": "approve"}
    )

    assert resp.status_code == 422
    assert not mock_client.tables["companies"].insert.called


def test_approve_rolls_back_company_on_invite_failure(client, as_super_admin, monkeypatch):
    mock_client = _mock_reg_client(monkeypatch)
    mock_client.auth.admin.invite_user_by_email.side_effect = Exception("email rate limit exceeded")

    resp = client.post(
        "/registration/requests/r1/review",
        json={"action": "approve", "plan": "starter", "subscription_months": 6},
    )

    assert resp.status_code == 502
    assert "Quota" in resp.json()["detail"]
    # compensation : le tenant fraîchement créé est supprimé
    delete_eq = mock_client.tables["companies"].delete.return_value.eq
    assert delete_eq.call_args.args == ("id", "co-new")


def test_review_forbidden_for_admin(client, as_admin, monkeypatch):
    mock_client = _mock_reg_client(monkeypatch)

    resp = client.post(
        "/registration/requests/r1/review", json={"action": "reject"}
    )

    assert resp.status_code == 403
    mock_client.table.assert_not_called()


def test_add_months_clamps_end_of_month():
    from datetime import date

    assert reg_service._add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert reg_service._add_months(date(2026, 7, 17), 12) == date(2027, 7, 17)
    assert reg_service._add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)  # bissextile
