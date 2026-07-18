"""Tests du module Recettes — via le service partagé app.core.transactions.
Une recette N'A PAS d'approbation : elle est créée directement « confirmée »
(statut approved). Couvre : création (source + type de catégorie + statut),
liste, justificatif attachable sur une recette confirmée."""

import io
from types import SimpleNamespace
from unittest.mock import MagicMock

import app.core.transactions as tx_service
from tests.conftest import SIMPLE_USER

REV_ID = "a1000000-0000-0000-0000-000000000001"
CAT_ID = "b1000000-0000-0000-0000-000000000001"

MY_REVENUE = {
    "id": REV_ID,
    "amount": "500.00",
    "revenue_date": "2026-07-16",
    "description": "Vente comptant",
    "source": "Client A",
    "status": "approved",  # confirmée dès la création
    "category_id": CAT_ID,
    "proof_path": None,
    "rejection_reason": None,
    "created_at": "2026-07-16T12:00:00+00:00",
    "user_id": SIMPLE_USER.id,
    "company_id": SIMPLE_USER.company_id,
}


def _mock_client(monkeypatch, *, category_type="revenue"):
    mock_client = MagicMock()
    tables = {"revenues": MagicMock(), "categories": MagicMock(), "profiles": MagicMock()}
    mock_client.table.side_effect = lambda name: tables[name]
    mock_client.tables = tables

    tables["categories"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": CAT_ID, "name": "Ventes", "type": category_type}]
    )
    tables["categories"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": CAT_ID, "name": "Ventes"}]
    )
    tables["revenues"].insert.return_value.execute.return_value = SimpleNamespace(data=[MY_REVENUE])
    tables["revenues"].select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = SimpleNamespace(
        data=[MY_REVENUE]
    )
    # get_for_member (justificatif) : select().eq().eq().execute()
    tables["revenues"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[MY_REVENUE]
    )
    tables["revenues"].update.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[MY_REVENUE])
    mock_client.storage.from_.return_value.upload.return_value = SimpleNamespace(path="x")

    monkeypatch.setattr(tx_service, "get_service_client", lambda: mock_client)
    return mock_client


def test_create_revenue_is_confirmed_immediately(client, as_user, monkeypatch):
    mock_client = _mock_client(monkeypatch)

    resp = client.post(
        "/revenues",
        json={"amount": 500, "category_id": CAT_ID, "description": "Vente", "source": "Client A"},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "approved"  # pas d'approbation : confirmée d'emblée
    assert body["source"] == "Client A"
    inserted = mock_client.tables["revenues"].insert.call_args.args[0]
    assert inserted["status"] == "approved"  # créée directement confirmée
    assert inserted["company_id"] == SIMPLE_USER.company_id
    assert inserted["user_id"] == SIMPLE_USER.id
    assert inserted["source"] == "Client A"


def test_create_revenue_rejects_expense_category(client, as_user, monkeypatch):
    """Une recette sur une catégorie de type 'expense' est refusée (422)."""
    mock_client = _mock_client(monkeypatch, category_type="expense")

    resp = client.post("/revenues", json={"amount": 100, "category_id": CAT_ID})

    assert resp.status_code == 422
    mock_client.tables["revenues"].insert.assert_not_called()


def test_list_my_revenues(client, as_user, monkeypatch):
    _mock_client(monkeypatch)

    resp = client.get("/revenues/mine")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["source"] == "Client A"
    assert body[0]["status"] == "approved"


def test_no_pending_or_review_endpoints():
    """Le flux d'approbation des recettes n'existe plus (pas d'endpoint pending/review)."""
    from app.main import app

    paths = {route.path for route in app.routes}
    assert "/revenues/pending" not in paths
    assert "/revenues/{revenue_id}/review" not in paths


def test_upload_proof_on_confirmed_revenue(client, as_user, monkeypatch):
    """L'auteur peut joindre un justificatif à sa recette confirmée (statut approved)."""
    mock_client = _mock_client(monkeypatch)

    resp = client.post(
        f"/revenues/{REV_ID}/proof",
        files={"file": ("facture.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
    )

    assert resp.status_code == 201
    upload_call = mock_client.storage.from_.return_value.upload.call_args
    path = upload_call.args[0]
    assert path.startswith(f"{SIMPLE_USER.company_id}/revenues/{REV_ID}/")
