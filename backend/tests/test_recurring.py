"""Tests des dépenses automatiques : CRUD admin-only, calcul des échéances,
matérialisation catch-up (rétroactive, idempotente, arrêt automatique)."""

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import app.modules.recurring.service as recurring_service

# Capturée à l'import, AVANT que la fixture autouse de conftest ne neutralise
# la matérialisation (même patron que test_alerts).
REAL_MATERIALIZE = recurring_service.materialize_due

CATEGORY = {"id": "cat1", "name": "Logiciels", "type": "expense", "company_id": None}

RECURRING_ROW = {
    "id": "rec1",
    "company_id": None,  # renseigné par _row(as_admin)
    "category_id": "cat1",
    "amount": "45000.00",
    "description": "Licence comptabilité",
    "day_of_month": 1,
    "months_total": 3,
    "months_done": 0,
    "active": True,
    "next_due": "2026-08-01",
    "created_by": "creator-1",
    "created_at": "2026-07-18T10:00:00+00:00",
}

CREATE_PAYLOAD = {
    "category_id": "cat1",
    "amount": 45000,
    "description": "Licence comptabilité",
    "day_of_month": 1,
    "months_total": 3,
    "active": True,
}


def _row(as_admin, **over):
    base = {**RECURRING_ROW, "company_id": as_admin.company_id}
    base.update(over)
    return base


def _mock_client(monkeypatch, *, recurring_rows=None, category=None, existing_expense=None):
    """Mocks par table (chaînes distinctes par usage) :
    - categories : select().eq(id).eq(company).execute() [vérif création]
                   select().eq(company).execute()        [noms]
    - recurring  : insert / select().eq(id) / select().eq().order() [liste]
                   select().eq().eq().lte() [échéances dues] / update / delete
    - expenses   : select().eq().eq() [idempotence] / insert
    """
    mock_client = MagicMock()
    tables = {"categories": MagicMock(), "recurring_expenses": MagicMock(), "expenses": MagicMock()}
    mock_client.table.side_effect = lambda name: tables[name]
    mock_client.tables = tables

    cat = category if category is not None else CATEGORY
    tables["categories"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[cat] if cat else []
    )
    tables["categories"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "cat1", "name": "Logiciels"}]
    )

    rows = recurring_rows or []
    rec = tables["recurring_expenses"]
    rec.insert.return_value.execute.return_value = SimpleNamespace(data=[rows[0] if rows else RECURRING_ROW])
    rec.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=rows)
    rec.select.return_value.eq.return_value.order.return_value.execute.return_value = SimpleNamespace(data=rows)
    rec.select.return_value.eq.return_value.eq.return_value.lte.return_value.execute.return_value = SimpleNamespace(
        data=rows
    )
    rec.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])
    rec.delete.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])

    tables["expenses"].select.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[existing_expense] if existing_expense else []
    )
    tables["expenses"].insert.return_value.execute.return_value = SimpleNamespace(data=[])

    monkeypatch.setattr(recurring_service, "get_service_client", lambda: mock_client)
    return mock_client


# --- Calcul des échéances ---


def test_first_due_this_month_or_next():
    # Le jour n'est pas passé → ce mois-ci ; passé → mois suivant.
    assert recurring_service.first_due(date(2026, 7, 18), 25) == date(2026, 7, 25)
    assert recurring_service.first_due(date(2026, 7, 18), 5) == date(2026, 8, 5)
    assert recurring_service.first_due(date(2026, 7, 18), 18) == date(2026, 7, 18)
    # « Chaque 31 » borné au dernier jour (février).
    assert recurring_service.first_due(date(2026, 2, 10), 31) == date(2026, 2, 28)
    # Décembre → janvier.
    assert recurring_service.first_due(date(2026, 12, 20), 5) == date(2027, 1, 5)


# --- CRUD (endpoints, matérialisation neutralisée par conftest) ---


def test_create_recurring_success(client, as_admin, monkeypatch, silence_audit):
    mock_client = _mock_client(monkeypatch, recurring_rows=[_row(as_admin)])
    monkeypatch.setattr(recurring_service, "_today", lambda: date(2026, 7, 18))

    resp = client.post("/recurring-expenses", json=CREATE_PAYLOAD)

    assert resp.status_code == 201
    body = resp.json()
    assert body["description"] == "Licence comptabilité"
    assert body["category_name"] == "Logiciels"
    assert body["months_done"] == 0 and body["months_total"] == 3

    inserted = mock_client.tables["recurring_expenses"].insert.call_args.args[0]
    assert inserted["company_id"] == as_admin.company_id
    assert inserted["created_by"] == as_admin.id
    assert inserted["next_due"] == "2026-08-01"  # le 1er est passé → mois prochain
    assert any(c["action"] == "recurring.created" for c in silence_audit)


def test_create_forbidden_for_user(client, as_user, monkeypatch):
    mock_client = _mock_client(monkeypatch)

    resp = client.post("/recurring-expenses", json=CREATE_PAYLOAD)

    assert resp.status_code == 403
    mock_client.tables["recurring_expenses"].insert.assert_not_called()


def test_create_rejects_revenue_category(client, as_admin, monkeypatch):
    _mock_client(monkeypatch, category={**CATEGORY, "type": "revenue"})

    resp = client.post("/recurring-expenses", json=CREATE_PAYLOAD)

    assert resp.status_code == 400
    assert "catégorie de dépense" in resp.json()["detail"]


def test_create_unknown_category_404(client, as_admin, monkeypatch):
    _mock_client(monkeypatch, category={})

    resp = client.post("/recurring-expenses", json=CREATE_PAYLOAD)

    assert resp.status_code == 404


def test_create_validates_bounds(client, as_admin, monkeypatch):
    _mock_client(monkeypatch)

    assert client.post("/recurring-expenses", json={**CREATE_PAYLOAD, "day_of_month": 32}).status_code == 422
    assert client.post("/recurring-expenses", json={**CREATE_PAYLOAD, "months_total": 0}).status_code == 422
    assert client.post("/recurring-expenses", json={**CREATE_PAYLOAD, "amount": 0}).status_code == 422


def test_list_forbidden_for_user(client, as_user, monkeypatch):
    _mock_client(monkeypatch)
    assert client.get("/recurring-expenses").status_code == 403


def test_pause_and_resume(client, as_admin, monkeypatch, silence_audit):
    mock_client = _mock_client(monkeypatch, recurring_rows=[_row(as_admin)])

    resp = client.patch("/recurring-expenses/rec1", json={"active": False})

    assert resp.status_code == 200
    update_payload = mock_client.tables["recurring_expenses"].update.call_args.args[0]
    assert update_payload == {"active": False}
    assert any(c["action"] == "recurring.updated" for c in silence_audit)


def test_resume_finished_is_conflict(client, as_admin, monkeypatch):
    _mock_client(
        monkeypatch,
        recurring_rows=[_row(as_admin, months_done=3, active=False)],
    )

    resp = client.patch("/recurring-expenses/rec1", json={"active": True})

    assert resp.status_code == 409
    assert "terminée" in resp.json()["detail"]


def test_update_other_company_is_404(client, as_admin, monkeypatch):
    _mock_client(
        monkeypatch,
        recurring_rows=[_row(as_admin, company_id="99999999-9999-9999-9999-999999999999")],
    )

    resp = client.patch("/recurring-expenses/rec1", json={"active": False})

    assert resp.status_code == 404


def test_delete_recurring(client, as_admin, monkeypatch, silence_audit):
    mock_client = _mock_client(monkeypatch, recurring_rows=[_row(as_admin)])

    resp = client.delete("/recurring-expenses/rec1")

    assert resp.status_code == 204
    mock_client.tables["recurring_expenses"].delete.assert_called_once()
    assert any(c["action"] == "recurring.deleted" for c in silence_audit)


# --- Matérialisation catch-up (vraie fonction, client mocké) ---


def test_materialize_generates_due_occurrence(monkeypatch, capture_threshold_checks):
    mock_client = _mock_client(
        monkeypatch,
        recurring_rows=[{**RECURRING_ROW, "company_id": "co1", "next_due": "2026-07-01"}],
    )
    monkeypatch.setattr(recurring_service, "_today", lambda: date(2026, 7, 18))

    generated = REAL_MATERIALIZE("co1")

    assert generated == 1
    expense = mock_client.tables["expenses"].insert.call_args.args[0]
    assert expense["status"] == "approved"  # décision produit : pas de validation
    assert expense["expense_date"] == "2026-07-01"
    assert expense["recurring_id"] == "rec1"
    assert expense["user_id"] == "creator-1"
    assert "automatique 1/3" in expense["description"]
    # Curseur avancé, toujours active (1/3)
    update_payload = mock_client.tables["recurring_expenses"].update.call_args.args[0]
    assert update_payload == {"months_done": 1, "next_due": "2026-08-01", "active": True}
    # Les seuils budgétaires s'appliquent aussi aux dépenses automatiques
    assert len(capture_threshold_checks) == 1


def test_materialize_catches_up_missed_months(monkeypatch):
    """Personne ne s'est connecté pendant 3 échéances → toutes rattrapées à leur date."""
    mock_client = _mock_client(
        monkeypatch,
        recurring_rows=[
            {**RECURRING_ROW, "company_id": "co1", "next_due": "2026-05-05",
             "day_of_month": 5, "months_total": 12, "months_done": 1}
        ],
    )
    monkeypatch.setattr(recurring_service, "_today", lambda: date(2026, 7, 18))

    generated = REAL_MATERIALIZE("co1")

    assert generated == 3
    dates = [c.args[0]["expense_date"] for c in mock_client.tables["expenses"].insert.call_args_list]
    assert dates == ["2026-05-05", "2026-06-05", "2026-07-05"]
    update_payload = mock_client.tables["recurring_expenses"].update.call_args.args[0]
    assert update_payload == {"months_done": 4, "next_due": "2026-08-05", "active": True}


def test_materialize_completes_and_deactivates(monkeypatch):
    """Dernier mois décompté → abandon automatique de l'automatisation."""
    mock_client = _mock_client(
        monkeypatch,
        recurring_rows=[
            {**RECURRING_ROW, "company_id": "co1", "next_due": "2026-07-01",
             "months_total": 1, "months_done": 0}
        ],
    )
    monkeypatch.setattr(recurring_service, "_today", lambda: date(2026, 7, 18))

    generated = REAL_MATERIALIZE("co1")

    assert generated == 1
    update_payload = mock_client.tables["recurring_expenses"].update.call_args.args[0]
    assert update_payload["active"] is False


def test_materialize_is_idempotent(monkeypatch):
    """Échéance déjà décomptée (index unique) : jamais de double décompte,
    mais le curseur avance quand même."""
    mock_client = _mock_client(
        monkeypatch,
        recurring_rows=[{**RECURRING_ROW, "company_id": "co1", "next_due": "2026-07-01"}],
        existing_expense={"id": "e-exists"},
    )
    monkeypatch.setattr(recurring_service, "_today", lambda: date(2026, 7, 18))

    generated = REAL_MATERIALIZE("co1")

    assert generated == 0
    mock_client.tables["expenses"].insert.assert_not_called()
    update_payload = mock_client.tables["recurring_expenses"].update.call_args.args[0]
    assert update_payload["months_done"] == 1


def test_materialize_never_raises(monkeypatch):
    monkeypatch.setattr(
        recurring_service, "get_service_client", lambda: (_ for _ in ()).throw(RuntimeError("down"))
    )
    assert REAL_MATERIALIZE("co1") == 0  # best-effort : silencieux