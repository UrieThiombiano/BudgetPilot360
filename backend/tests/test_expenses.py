"""Tests du module Dépenses côté utilisateur (tâche 3.1) :
création, mes dépenses, justificatif (Storage mocké), commentaires, accès."""

import io
from types import SimpleNamespace
from unittest.mock import MagicMock

import app.core.transactions as tx_service
import app.modules.expenses.service as exp_service
from tests.conftest import ADMIN, SIMPLE_USER

EXPENSE_ID = "e1000000-0000-0000-0000-000000000001"
CAT_ID = "c1000000-0000-0000-0000-000000000001"

MY_EXPENSE = {
    "id": EXPENSE_ID,
    "amount": "120.50",
    "expense_date": "2026-07-16",
    "description": "Taxi aéroport",
    "status": "pending",
    "category_id": CAT_ID,
    "receipt_path": None,
    "rejection_reason": None,
    "created_at": "2026-07-16T12:00:00+00:00",
    "user_id": SIMPLE_USER.id,
    "company_id": SIMPLE_USER.company_id,
}


def _mock_client(monkeypatch, *, expense=None, expense_owner=None):
    """Fake supabase par table, avec chaînes select/insert/update configurables."""
    expense = dict(expense or MY_EXPENSE)
    if expense_owner:
        expense["user_id"] = expense_owner

    mock_client = MagicMock()
    tables = {
        "categories": MagicMock(),
        "expenses": MagicMock(),
        "expense_comments": MagicMock(),
        "profiles": MagicMock(),
    }
    mock_client.table.side_effect = lambda name: tables[name]
    mock_client.tables = tables

    # categories : select().eq().eq().execute() (lookup) et select().eq().execute() (noms)
    tables["categories"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": CAT_ID, "name": "Transport"}]
    )
    tables["categories"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": CAT_ID, "name": "Transport"}]
    )

    # expenses : insert / select mine (eq.eq.order) / select one (eq.eq) / update
    tables["expenses"].insert.return_value.execute.return_value = SimpleNamespace(
        data=[{**expense, "id": EXPENSE_ID}]
    )
    tables["expenses"].select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = SimpleNamespace(
        data=[expense]
    )
    tables["expenses"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[expense]
    )
    tables["expenses"].update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[expense]
    )

    # commentaires
    tables["expense_comments"].select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "cm1", "user_id": ADMIN.id, "content": "OK pour moi", "created_at": None}]
    )
    tables["expense_comments"].insert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "cm2", "user_id": SIMPLE_USER.id, "content": "Merci", "created_at": None}]
    )

    # profils (noms des auteurs)
    tables["profiles"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {"id": ADMIN.id, "full_name": "Awa Admin", "email": ADMIN.email},
            {"id": SIMPLE_USER.id, "full_name": "Jean User", "email": SIMPLE_USER.email},
        ]
    )

    # storage
    mock_client.storage.from_.return_value.upload.return_value = SimpleNamespace(path="x")
    mock_client.storage.from_.return_value.create_signed_url.return_value = {
        "signedURL": "https://signed.example/receipt?token=abc"
    }

    # Le CRUD/workflow vit désormais dans app.core.transactions (service partagé
    # dépenses/recettes) ; les commentaires restent dans expenses.service. On
    # patche les deux vers le même mock.
    monkeypatch.setattr(exp_service, "get_service_client", lambda: mock_client)
    monkeypatch.setattr(tx_service, "get_service_client", lambda: mock_client)
    return mock_client


def test_create_expense(client, as_user, monkeypatch):
    mock_client = _mock_client(monkeypatch)

    resp = client.post(
        "/expenses",
        json={"amount": 120.5, "category_id": CAT_ID, "description": "Taxi aéroport"},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert body["category_name"] == "Transport"
    inserted = mock_client.tables["expenses"].insert.call_args.args[0]
    assert inserted["company_id"] == SIMPLE_USER.company_id
    assert inserted["user_id"] == SIMPLE_USER.id
    assert inserted["status"] == "pending"


def test_create_expense_unknown_category(client, as_user, monkeypatch):
    mock_client = _mock_client(monkeypatch)
    mock_client.tables["categories"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )

    resp = client.post("/expenses", json={"amount": 10, "category_id": "autre"})

    assert resp.status_code == 404
    mock_client.tables["expenses"].insert.assert_not_called()


def test_create_expense_invalid_amount(client, as_user, monkeypatch):
    _mock_client(monkeypatch)
    resp = client.post("/expenses", json={"amount": 0, "category_id": CAT_ID})
    assert resp.status_code == 422


def test_list_my_expenses(client, as_user, monkeypatch):
    _mock_client(monkeypatch)

    resp = client.get("/expenses/mine")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["status"] == "pending"
    assert body[0]["category_name"] == "Transport"
    assert body[0]["has_receipt"] is False


def test_upload_receipt(client, as_user, monkeypatch):
    mock_client = _mock_client(monkeypatch)

    resp = client.post(
        f"/expenses/{EXPENSE_ID}/receipt",
        files={"file": ("facture.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
    )

    assert resp.status_code == 201
    upload_call = mock_client.storage.from_.return_value.upload.call_args
    path = upload_call.args[0]
    assert path.startswith(f"{SIMPLE_USER.company_id}/{EXPENSE_ID}/")
    assert path.endswith(".pdf")


def test_upload_receipt_bad_type(client, as_user, monkeypatch):
    mock_client = _mock_client(monkeypatch)

    resp = client.post(
        f"/expenses/{EXPENSE_ID}/receipt",
        files={"file": ("script.exe", io.BytesIO(b"MZ"), "application/octet-stream")},
    )

    assert resp.status_code == 415
    mock_client.storage.from_.return_value.upload.assert_not_called()


def test_upload_receipt_only_owner(client, as_admin, monkeypatch):
    # L'admin voit la dépense mais ne peut pas y joindre un justificatif à la place de l'auteur
    _mock_client(monkeypatch, expense_owner=SIMPLE_USER.id)

    resp = client.post(
        f"/expenses/{EXPENSE_ID}/receipt",
        files={"file": ("f.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
    )

    assert resp.status_code == 403


def test_upload_receipt_locked_after_review(client, as_user, monkeypatch):
    _mock_client(monkeypatch, expense={**MY_EXPENSE, "status": "approved"})

    resp = client.post(
        f"/expenses/{EXPENSE_ID}/receipt",
        files={"file": ("f.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
    )

    assert resp.status_code == 409


def test_get_receipt_url(client, as_user, monkeypatch):
    _mock_client(monkeypatch, expense={**MY_EXPENSE, "receipt_path": "cid/eid/f.pdf"})

    resp = client.get(f"/expenses/{EXPENSE_ID}/receipt")

    assert resp.status_code == 200
    assert resp.json()["url"].startswith("https://signed.example/")


def test_get_receipt_url_none(client, as_user, monkeypatch):
    _mock_client(monkeypatch)
    resp = client.get(f"/expenses/{EXPENSE_ID}/receipt")
    assert resp.status_code == 404


def test_expense_not_accessible_to_other_user(client, monkeypatch):
    """Un autre user (non admin, non auteur) de la même entreprise → 403."""
    from app.core.security import get_current_user
    from app.main import app
    from app.core.security import CurrentUser

    other = CurrentUser(
        id="00000000-0000-0000-0000-0000000000ff",
        email="autre@acme-corp.fr",
        company_id=SIMPLE_USER.company_id,
        role="user",
    )
    app.dependency_overrides[get_current_user] = lambda: other
    _mock_client(monkeypatch, expense_owner=SIMPLE_USER.id)

    resp = client.get(f"/expenses/{EXPENSE_ID}/comments")

    assert resp.status_code == 403


def test_comments_flow(client, as_user, monkeypatch):
    _mock_client(monkeypatch)

    resp = client.get(f"/expenses/{EXPENSE_ID}/comments")
    assert resp.status_code == 200
    assert resp.json()[0]["author_name"] == "Awa Admin"

    resp = client.post(f"/expenses/{EXPENSE_ID}/comments", json={"content": "Merci"})
    assert resp.status_code == 201
    assert resp.json()["content"] == "Merci"


def test_comment_admin_on_member_expense(client, as_admin, monkeypatch):
    """L'admin peut commenter la dépense d'un membre de son entreprise."""
    _mock_client(monkeypatch, expense_owner=SIMPLE_USER.id)

    resp = client.post(f"/expenses/{EXPENSE_ID}/comments", json={"content": "Justificatif ?"})

    assert resp.status_code == 201


def test_comment_empty_rejected(client, as_user, monkeypatch):
    _mock_client(monkeypatch)
    resp = client.post(f"/expenses/{EXPENSE_ID}/comments", json={"content": ""})
    assert resp.status_code == 422
