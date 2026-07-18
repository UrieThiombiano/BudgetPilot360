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


def _mock_team_client(monkeypatch, *, members=None, user_count=0, invite_error=None, owner_id="a1"):
    """Chaînes utilisées par le service :
    - liste :  table("profiles").select().eq().is_().order().execute() → .data
      (le comptage des collaborateurs se fait désormais sur cette liste)
    - owner :  table("companies").select().eq().execute() → .data[0]["owner_id"]
    - invitation : auth.admin.invite_user_by_email
    Si `members` est omis, `user_count` utilisateurs actifs sont générés.
    """
    if members is None:
        members = [
            {
                "id": f"u{i}",
                "email": f"user{i}@acme-corp.fr",
                "full_name": f"User {i}",
                "job_title": "Comptable",
                "role": "user",
                "created_at": "2026-07-02T10:00:00+00:00",
            }
            for i in range(user_count)
        ]
    mock_client = MagicMock()
    after_first_eq = mock_client.table.return_value.select.return_value.eq.return_value
    # list_members : .eq(company_id).is_(removed_at, null).order(created_at).execute()
    after_first_eq.is_.return_value.order.return_value.execute.return_value = (
        SimpleNamespace(data=members)
    )
    # get_owner_id : table("companies").select("owner_id").eq(id).execute()
    after_first_eq.execute.return_value = SimpleNamespace(data=[{"owner_id": owner_id}])

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
    mock_client = _mock_team_client(monkeypatch, members=MEMBERS, user_count=1)

    resp = client.get("/team/members")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["members"]) == 2
    assert body["owner_id"] == "a1"  # l'admin principal est identifié
    assert body["user_count"] == 1
    assert body["max_users"] == 3
    assert body["can_add_user"] is True
    jean = next(m for m in body["members"] if m["id"] == "u1")
    assert jean["job_title"] == "Comptable"

    # Les profils retirés sont exclus du listing (filtre removed_at IS NULL).
    select_after_eq = (
        mock_client.table.return_value.select.return_value.eq.return_value
    )
    select_after_eq.is_.assert_any_call("removed_at", "null")


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


def test_invite_rate_limit_gives_actionable_message(client, as_admin, monkeypatch):
    """Quota d'emails Supabase atteint : l'admin doit voir un message actionnable
    (pas un « Échec » opaque) qui pointe vers le SMTP personnalisé."""
    _mock_team_client(
        monkeypatch,
        user_count=1,
        invite_error=Exception("email rate limit exceeded"),
    )

    resp = client.post("/team/members", json=INVITE_PAYLOAD)

    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "Quota" in detail
    assert "SMTP" in detail


def test_invite_invalid_email_from_gotrue(client, as_admin, monkeypatch):
    """GoTrue valide la délivrabilité : un domaine sans MX est rejeté côté Supabase."""
    _mock_team_client(
        monkeypatch,
        user_count=1,
        invite_error=Exception("Email address is invalid"),
    )

    resp = client.post("/team/members", json=INVITE_PAYLOAD)

    assert resp.status_code == 422
    assert "invalide" in resp.json()["detail"].lower()


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


def test_invite_requires_job_title(client, as_admin, monkeypatch):
    """La fonction est OBLIGATOIRE : elle sert de libellé de rôle dans l'équipe."""
    _mock_team_client(monkeypatch, user_count=0)

    without_job = {k: v for k, v in INVITE_PAYLOAD.items() if k != "job_title"}
    assert client.post("/team/members", json=without_job).status_code == 422
    assert (
        client.post("/team/members", json={**INVITE_PAYLOAD, "job_title": ""}).status_code
        == 422
    )


# --- Retrait (désactivation douce) d'un utilisateur ---

def _mock_remove_client(monkeypatch, *, target):
    """Mocke les chaînes de remove_member :
    - fetch cible : table().select().eq(id).execute() → .data
    - marquage    : table().update({removed_at}).eq(id).execute()
    - ban Auth    : auth.admin.update_user_by_id(id, {ban_duration})
    """
    mock_client = MagicMock()
    select_eq = mock_client.table.return_value.select.return_value.eq.return_value
    select_eq.execute.return_value = SimpleNamespace(data=[target] if target else [])
    mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[])
    )
    monkeypatch.setattr(team_service, "get_service_client", lambda: mock_client)
    return mock_client


def _target(as_admin, **over):
    base = {
        "id": "u-remove",
        "company_id": as_admin.company_id,
        "role": "user",
        "removed_at": None,
        "email": "u2@acme-corp.fr",
    }
    base.update(over)
    return base


def test_remove_member_success(client, as_admin, monkeypatch, silence_audit):
    mock_client = _mock_remove_client(monkeypatch, target=_target(as_admin))

    resp = client.delete("/team/members/u-remove")

    assert resp.status_code == 204
    # Le profil est marqué retiré (jamais supprimé — imputabilité).
    update_payload = mock_client.table.return_value.update.call_args.args[0]
    assert "removed_at" in update_payload
    mock_client.table.return_value.update.return_value.eq.assert_called_with("id", "u-remove")
    # Le compte Auth est banni (plus aucune session possible).
    ban_call = mock_client.auth.admin.update_user_by_id.call_args
    assert ban_call.args[0] == "u-remove"
    assert ban_call.args[1]["ban_duration"]
    # Action sensible auditée.
    assert any(c["action"] == "team.member_removed" for c in silence_audit)


def test_remove_member_forbidden_for_simple_user(client, as_user, monkeypatch):
    mock_client = _mock_remove_client(monkeypatch, target=_target(as_user))

    resp = client.delete("/team/members/u-remove")

    assert resp.status_code == 403
    mock_client.auth.admin.update_user_by_id.assert_not_called()


def test_remove_member_not_found(client, as_admin, monkeypatch):
    _mock_remove_client(monkeypatch, target=None)

    resp = client.delete("/team/members/does-not-exist")

    assert resp.status_code == 404


def test_remove_member_other_company_is_404(client, as_admin, monkeypatch):
    # Un profil d'une autre entreprise ne doit pas être divulgué → 404, pas 403.
    mock_client = _mock_remove_client(
        monkeypatch, target=_target(as_admin, company_id="99999999-9999-9999-9999-999999999999")
    )

    resp = client.delete("/team/members/u-remove")

    assert resp.status_code == 404
    mock_client.auth.admin.update_user_by_id.assert_not_called()


def test_remove_member_cannot_remove_admin(client, as_admin, monkeypatch):
    _mock_remove_client(monkeypatch, target=_target(as_admin, id="a-other", role="admin"))

    resp = client.delete("/team/members/a-other")

    assert resp.status_code == 400
    assert "administrateur" in resp.json()["detail"].lower()


def test_remove_member_cannot_remove_self(client, as_admin, monkeypatch):
    _mock_remove_client(monkeypatch, target=_target(as_admin, id=as_admin.id, role="admin"))

    resp = client.delete(f"/team/members/{as_admin.id}")

    assert resp.status_code == 400
    assert "vous-même" in resp.json()["detail"].lower()


def test_remove_member_already_removed(client, as_admin, monkeypatch):
    _mock_remove_client(
        monkeypatch, target=_target(as_admin, removed_at="2026-07-17T00:00:00+00:00")
    )

    resp = client.delete("/team/members/u-remove")

    assert resp.status_code == 409
    assert "déjà retiré" in resp.json()["detail"].lower()


def test_super_admin_can_remove_across_companies(client, as_super_admin, monkeypatch):
    mock_client = _mock_remove_client(
        monkeypatch, target=_target(as_super_admin, company_id="77777777-7777-7777-7777-777777777777")
    )

    resp = client.delete("/team/members/u-remove")

    assert resp.status_code == 204
    mock_client.auth.admin.update_user_by_id.assert_called_once()


# --- Admin adjoint : nomination / révocation (réservé au propriétaire) ---

def _mock_role_client(monkeypatch, *, target, owner_id, members=None):
    """Mocke set_member_role avec des mocks distincts par table :
    - profiles : fetch cible (.select().eq().execute()),
                 liste active (.select().eq().is_().order().execute()),
                 update rôle (.update().eq().execute())
    - companies : owner (.select().eq().execute())
    """
    mock_client = MagicMock()
    profiles = MagicMock()
    companies = MagicMock()
    mock_client.table.side_effect = lambda name: {
        "profiles": profiles,
        "companies": companies,
    }[name]
    profiles.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[target] if target else []
    )
    profiles.select.return_value.eq.return_value.is_.return_value.order.return_value.execute.return_value = SimpleNamespace(
        data=members or []
    )
    companies.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"owner_id": owner_id}]
    )
    profiles.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(team_service, "get_service_client", lambda: mock_client)
    return mock_client, profiles


def _role_target(as_admin, **over):
    base = {
        "id": "u1",
        "company_id": as_admin.company_id,
        "role": "user",
        "removed_at": None,
        "email": "u1@acme-corp.fr",
        "full_name": "Jean User",
        "job_title": "Comptable",
        "created_at": "2026-07-02T10:00:00+00:00",
    }
    base.update(over)
    return base


def test_owner_promotes_user_to_adjoint(client, as_admin, monkeypatch, silence_audit):
    """Le propriétaire nomme un de ses users admin adjoint (co-fondateurs)."""
    target = _role_target(as_admin)
    _, profiles = _mock_role_client(
        monkeypatch,
        target=target,
        owner_id=as_admin.id,
        members=[{"id": as_admin.id, "role": "admin"}, {"id": "u1", "role": "user"}],
    )

    resp = client.patch("/team/members/u1/role", json={"role": "admin"})

    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"
    profiles.update.assert_called_once_with({"role": "admin"})
    profiles.update.return_value.eq.assert_called_with("id", "u1")
    assert any(c["action"] == "team.member_role_changed" for c in silence_audit)


def test_promote_forbidden_for_non_owner_admin(client, as_admin, monkeypatch):
    """Un adjoint (admin non propriétaire) ne peut PAS gérer les rôles."""
    _, profiles = _mock_role_client(
        monkeypatch, target=_role_target(as_admin), owner_id="someone-else"
    )

    resp = client.patch("/team/members/u1/role", json={"role": "admin"})

    assert resp.status_code == 403
    assert "principal" in resp.json()["detail"]
    profiles.update.assert_not_called()


def test_promote_blocked_when_adjoint_already_exists(client, as_admin, monkeypatch):
    """1 seul adjoint par entreprise — décision produit."""
    _, profiles = _mock_role_client(
        monkeypatch,
        target=_role_target(as_admin),
        owner_id=as_admin.id,
        members=[
            {"id": as_admin.id, "role": "admin"},
            {"id": "a2", "role": "admin"},  # adjoint déjà en place
            {"id": "u1", "role": "user"},
        ],
    )

    resp = client.patch("/team/members/u1/role", json={"role": "admin"})

    assert resp.status_code == 409
    assert "seul" in resp.json()["detail"].lower()
    profiles.update.assert_not_called()


def test_owner_demotes_adjoint(client, as_admin, monkeypatch, silence_audit):
    """La révocation adjoint → user est toujours possible (il garde son siège)."""
    _, profiles = _mock_role_client(
        monkeypatch,
        target=_role_target(as_admin, id="a2", role="admin"),
        owner_id=as_admin.id,
    )

    resp = client.patch("/team/members/a2/role", json={"role": "user"})

    assert resp.status_code == 200
    assert resp.json()["role"] == "user"
    profiles.update.assert_called_once_with({"role": "user"})


def test_owner_role_is_untouchable(client, as_admin, monkeypatch):
    _, profiles = _mock_role_client(
        monkeypatch,
        target=_role_target(as_admin, id=as_admin.id, role="admin"),
        owner_id=as_admin.id,
    )

    resp = client.patch(f"/team/members/{as_admin.id}/role", json={"role": "user"})

    assert resp.status_code == 400
    assert "principal" in resp.json()["detail"]
    profiles.update.assert_not_called()


def test_set_role_forbidden_for_simple_user(client, as_user, monkeypatch):
    _, profiles = _mock_role_client(
        monkeypatch, target=_role_target(as_user), owner_id="whoever"
    )

    resp = client.patch("/team/members/u1/role", json={"role": "admin"})

    assert resp.status_code == 403
    profiles.update.assert_not_called()


def test_set_role_other_company_is_404(client, as_admin, monkeypatch):
    _, profiles = _mock_role_client(
        monkeypatch,
        target=_role_target(as_admin, company_id="99999999-9999-9999-9999-999999999999"),
        owner_id=as_admin.id,
    )

    resp = client.patch("/team/members/u1/role", json={"role": "admin"})

    assert resp.status_code == 404
    profiles.update.assert_not_called()
