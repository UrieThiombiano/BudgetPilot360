"""Tests de la gestion d'équipe /team : liste, INVITATION (jamais de mot de
passe côté admin — imputabilité), limite de 3, RBAC."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import app.modules.team.service as team_service

MEMBERS = [
    {
        "id": "a1",
        "email": "admin@acme-corp.fr",
        "full_name": "Awa Admin",
        "job_title": None,
        "role": "admin",
        "created_at": "2026-07-01T10:00:00+00:00",
    },
    {
        "id": "u1",
        "email": "user1@acme-corp.fr",
        "full_name": "Jean User",
        "job_title": "Comptable",
        "role": "user",
        "created_at": "2026-07-02T10:00:00+00:00",
    },
]

INVITE_PAYLOAD = {
    "email": "user2@acme-corp.fr",
    "first_name": "Awa",
    "last_name": "Ouédraogo",
    "job_title": "Assistante de direction",
}


def _mock_team_client(monkeypatch, *, members=None, user_count=0, invite_error=None):
    """Chaînes utilisées par le service :
    - liste :  table().select().eq().order().execute()  → .data
    - compte : table().select().eq().eq().execute()     → .count
    - invitation : auth.admin.invite_user_by_email
    """
    mock_client = MagicMock()
    after_first_eq = mock_client.table.return_value.select.return_value.eq.return_value
    after_first_eq.order.return_value.execute.return_value = SimpleNamespace(
        data=members or []
    )
    after_first_eq.eq.return_value.execute.return_value = SimpleNamespace(
        count=user_count, data=[]
    )

    if invite_error is not None:
        mock_client.auth.admin.invite_user_by_email.side_effect = invite_error
    else:
        mock_client.auth.admin.invite_user_by_email.return_value = SimpleNamespace(
            user=SimpleNamespace(id="new-user-id")
        )
    mock_client.table.return_value.upsert.return_value.execute.return_value = (
        SimpleNamespace(data=[])
    )

    monkeypatch.setattr(team_service, "get_service_client", lambda: mock_client)
    return mock_client


def test_list_members(client, as_admin, monkeypatch):
    _mock_team_client(monkeypatch, members=MEMBERS, user_count=1)

    resp = client.get("/team/members")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["members"]) == 2
    assert body["user_count"] == 1
    assert body["max_users"] == 3
    assert body["can_add_user"] is True
    jean = next(m for m in body["members"] if m["id"] == "u1")
    assert jean["job_title"] == "Comptable"


def test_list_members_forbidden_for_simple_user(client, as_user):
    resp = client.get("/team/members")
    assert resp.status_code == 403


def test_invite_member_success_without_any_password(client, as_admin, monkeypatch):
    mock_client = _mock_team_client(monkeypatch, user_count=1)

    resp = client.post("/team/members", json=INVITE_PAYLOAD)

    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "user2@acme-corp.fr"
    assert body["full_name"] == "Awa Ouédraogo"
    assert body["role"] == "user"

    # L'invitation part avec l'email + le lien d'activation — JAMAIS un mot de passe
    invite_args = mock_client.auth.admin.invite_user_by_email.call_args
    assert invite_args.args[0] == "user2@acme-corp.fr"
    options = invite_args.args[1]
    assert "password" not in options  # aucune clé mot de passe dans l'appel
    assert "password" not in options["data"]
    assert options["redirect_to"].endswith("/set-password")

    upsert_payload = mock_client.table.return_value.upsert.call_args.args[0]
    assert upsert_payload["company_id"] == as_admin.company_id
    assert upsert_payload["role"] == "user"
    assert upsert_payload["job_title"] == "Assistante de direction"


def test_invite_rejects_password_field(client, as_admin, monkeypatch):
    """Le schéma n'accepte plus de mot de passe : l'admin ne peut PAS en fournir un."""
    mock_client = _mock_team_client(monkeypatch, user_count=0)

    resp = client.post(
        "/team/members",
        json={**INVITE_PAYLOAD, "temporary_password": "JeVeuxLeChoisir1!"},
    )

    # Champ inconnu ignoré par Pydantic : l'invitation part quand même sans mot de passe
    assert resp.status_code == 201
    options = mock_client.auth.admin.invite_user_by_email.call_args.args[1]
    assert "JeVeuxLeChoisir1!" not in str(options)


def test_invite_blocked_at_limit(client, as_admin, monkeypatch):
    mock_client = _mock_team_client(monkeypatch, user_count=3)

    resp = client.post("/team/members", json=INVITE_PAYLOAD)

    assert resp.status_code == 409
    assert "Limite atteinte" in resp.json()["detail"]
    mock_client.auth.admin.invite_user_by_email.assert_not_called()


def test_invite_forbidden_for_simple_user(client, as_user, monkeypatch):
    mock_client = _mock_team_client(monkeypatch, user_count=0)

    resp = client.post("/team/members", json=INVITE_PAYLOAD)

    assert resp.status_code == 403
    mock_client.auth.admin.invite_user_by_email.assert_not_called()


def test_invite_duplicate_email(client, as_admin, monkeypatch):
    _mock_team_client(
        monkeypatch,
        user_count=1,
        invite_error=Exception("A user with this email address has already been registered"),
    )

    resp = client.post("/team/members", json=INVITE_PAYLOAD)

    assert resp.status_code == 409
    assert "existe déjà" in resp.json()["detail"]


def test_invite_rolls_back_auth_user_on_profile_failure(client, as_admin, monkeypatch):
    mock_client = _mock_team_client(monkeypatch, user_count=0)
    mock_client.table.return_value.upsert.return_value.execute.side_effect = Exception(
        "connection lost"
    )

    resp = client.post("/team/members", json=INVITE_PAYLOAD)

    assert resp.status_code == 502
    mock_client.auth.admin.delete_user.assert_called_once_with("new-user-id")


def test_invite_requires_names_and_valid_email(client, as_admin, monkeypatch):
    _mock_team_client(monkeypatch, user_count=0)

    assert (
        client.post("/team/members", json={**INVITE_PAYLOAD, "email": "pas-un-email"}).status_code
        == 422
    )
    assert (
        client.post("/team/members", json={**INVITE_PAYLOAD, "first_name": ""}).status_code
        == 422
    )
