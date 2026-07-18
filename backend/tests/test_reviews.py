"""Tests du workflow d'approbation (tâche 4.1) : liste pending, approve/reject,
transition atomique, motif obligatoire, audit, notification, notifications API."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import app.core.transactions as tx_service
import app.modules.expenses.service as exp_service
import app.modules.notifications.service as notif_service
from tests.conftest import ADMIN, SIMPLE_USER

EXPENSE_ID = "e1000000-0000-0000-0000-000000000001"
CAT_ID = "c1000000-0000-0000-0000-000000000001"

PENDING = {
    "id": EXPENSE_ID,
    "amount": "120.50",
    "expense_date": "2026-07-16",
    "description": "Taxi",
    "category_id": CAT_ID,
    "user_id": SIMPLE_USER.id,
    "receipt_path": "cid/eid/f.png",
    "created_at": "2026-07-16T12:00:00+00:00",
}


def _mock_exp_client(monkeypatch, *, update_returns=None):
    mock_client = MagicMock()
    tables = {"expenses": MagicMock(), "categories": MagicMock(), "profiles": MagicMock()}
    mock_client.table.side_effect = lambda name: tables[name]
    mock_client.tables = tables

    # pending list : select().eq().eq().order().execute()
    tables["expenses"].select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = SimpleNamespace(
        data=[PENDING]
    )
    # review : update().eq().eq().eq().execute()
    reviewed = {**PENDING, "status": "approved", "rejection_reason": None}
    tables["expenses"].update.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=update_returns if update_returns is not None else [reviewed]
    )
    tables["categories"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": CAT_ID, "name": "Transport"}]
    )
    tables["profiles"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": SIMPLE_USER.id, "full_name": "Jean User", "email": SIMPLE_USER.email}]
    )

    monkeypatch.setattr(exp_service, "get_service_client", lambda: mock_client)
    monkeypatch.setattr(tx_service, "get_service_client", lambda: mock_client)
    return mock_client


def test_pending_list_admin(client, as_admin, monkeypatch):
    _mock_exp_client(monkeypatch)

    resp = client.get("/expenses/pending")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["author_name"] == "Jean User"
    assert body[0]["category_name"] == "Transport"
    assert body[0]["has_receipt"] is True


def test_pending_list_forbidden_for_user(client, as_user):
    resp = client.get("/expenses/pending")
    assert resp.status_code == 403


def test_approve_expense(client, as_admin, monkeypatch, silence_audit, capture_notifications):
    mock_client = _mock_exp_client(monkeypatch)

    resp = client.post(f"/expenses/{EXPENSE_ID}/review", json={"action": "approve"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"

    # transition conditionnée au statut pending (anti double revue)
    update_chain = mock_client.tables["expenses"].update.return_value
    eq_calls = [
        update_chain.eq.call_args,
        update_chain.eq.return_value.eq.call_args,
        update_chain.eq.return_value.eq.return_value.eq.call_args,
    ]
    assert any(c.args == ("status", "pending") for c in eq_calls)

    # champs de revue posés
    fields = mock_client.tables["expenses"].update.call_args.args[0]
    assert fields["status"] == "approved"
    assert fields["reviewed_by"] == ADMIN.id

    # audit + notification au créateur
    assert any(c["action"] == "expense.approved" for c in silence_audit)
    assert len(capture_notifications) == 1
    notif = capture_notifications[0]
    assert notif["user_id"] == SIMPLE_USER.id
    assert notif["type_"] == "expense_approved"


def test_approve_triggers_threshold_check(client, as_admin, monkeypatch, capture_threshold_checks):
    _mock_exp_client(monkeypatch)

    resp = client.post(f"/expenses/{EXPENSE_ID}/review", json={"action": "approve"})

    assert resp.status_code == 200
    assert len(capture_threshold_checks) == 1
    call = capture_threshold_checks[0]
    assert call["company_id"] == ADMIN.company_id
    assert call["expense"]["id"] == EXPENSE_ID


def test_reject_does_not_trigger_threshold_check(client, as_admin, monkeypatch, capture_threshold_checks):
    rejected = {**PENDING, "status": "rejected", "rejection_reason": "Hors périmètre"}
    _mock_exp_client(monkeypatch, update_returns=[rejected])

    resp = client.post(
        f"/expenses/{EXPENSE_ID}/review",
        json={"action": "reject", "reason": "Hors périmètre"},
    )

    assert resp.status_code == 200
    assert capture_threshold_checks == []


def test_reject_requires_reason(client, as_admin, monkeypatch):
    _mock_exp_client(monkeypatch)

    resp = client.post(f"/expenses/{EXPENSE_ID}/review", json={"action": "reject"})

    assert resp.status_code == 422


def test_reject_with_reason(client, as_admin, monkeypatch, silence_audit, capture_notifications):
    rejected = {**PENDING, "status": "rejected", "rejection_reason": "Justificatif illisible"}
    mock_client = _mock_exp_client(monkeypatch, update_returns=[rejected])

    resp = client.post(
        f"/expenses/{EXPENSE_ID}/review",
        json={"action": "reject", "reason": "Justificatif illisible"},
    )

    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
    fields = mock_client.tables["expenses"].update.call_args.args[0]
    assert fields["rejection_reason"] == "Justificatif illisible"
    assert any(c["action"] == "expense.rejected" for c in silence_audit)
    assert capture_notifications[0]["type_"] == "expense_rejected"
    assert "Justificatif illisible" in capture_notifications[0]["body"]


def test_review_already_processed(client, as_admin, monkeypatch, capture_notifications):
    _mock_exp_client(monkeypatch, update_returns=[])  # 0 ligne : déjà revue

    resp = client.post(f"/expenses/{EXPENSE_ID}/review", json={"action": "approve"})

    assert resp.status_code == 409
    assert capture_notifications == []


def test_review_forbidden_for_user(client, as_user, monkeypatch):
    mock_client = _mock_exp_client(monkeypatch)

    resp = client.post(f"/expenses/{EXPENSE_ID}/review", json={"action": "approve"})

    assert resp.status_code == 403
    mock_client.tables["expenses"].update.assert_not_called()


def test_invalid_action(client, as_admin, monkeypatch):
    _mock_exp_client(monkeypatch)
    resp = client.post(f"/expenses/{EXPENSE_ID}/review", json={"action": "peut-etre"})
    assert resp.status_code == 422


# --- API notifications ---


def _mock_notif_client(monkeypatch):
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "id": "n1",
                "type": "expense_approved",
                "title": "Dépense de 120.50 € approuvée",
                "body": None,
                "expense_id": EXPENSE_ID,
                "read_at": None,
                "created_at": "2026-07-16T13:00:00+00:00",
            }
        ]
    )
    mock_client.table.return_value.update.return_value.eq.return_value.is_.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )
    monkeypatch.setattr(notif_service, "get_service_client", lambda: mock_client)
    return mock_client


def test_list_notifications(client, as_user, monkeypatch):
    _mock_notif_client(monkeypatch)

    resp = client.get("/notifications")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["read"] is False
    assert body[0]["type"] == "expense_approved"


def test_mark_all_read(client, as_user, monkeypatch):
    mock_client = _mock_notif_client(monkeypatch)

    resp = client.post("/notifications/mark-read")

    assert resp.status_code == 204
    fields = mock_client.table.return_value.update.call_args.args[0]
    assert "read_at" in fields
