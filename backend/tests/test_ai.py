"""Tests de l'assistant IA (Phase 8.1) : contexte factuel, RBAC, prompt strict,
gestion clé absente / erreurs Mistral, audit."""

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx

import app.modules.ai_assistant.mistral as mistral_module
import app.modules.ai_assistant.service as ai_service
import app.modules.dashboard.service as dashboard_service
from app.core.config import settings

QUESTION = {"question": "Où en est le budget cette année ?"}


def _patch_prompt_and_mistral(monkeypatch, answer="Réponse factuelle."):
    calls = {}

    def fake_prompt(company_id):
        calls["company_id"] = company_id
        return "SYSPROMPT"

    def fake_ask(system_prompt, question):
        calls["system_prompt"] = system_prompt
        calls["question"] = question
        return answer

    monkeypatch.setattr(ai_service, "build_system_prompt", fake_prompt)
    monkeypatch.setattr(mistral_module, "ask_mistral", fake_ask)
    return calls


def test_ask_success(client, as_admin, monkeypatch, silence_audit):
    calls = _patch_prompt_and_mistral(monkeypatch)

    resp = client.post("/ai/ask", json=QUESTION)

    assert resp.status_code == 200
    assert resp.json()["answer"] == "Réponse factuelle."
    assert calls["company_id"] == as_admin.company_id  # contexte scopé tenant
    assert calls["system_prompt"] == "SYSPROMPT"
    audit_entry = next(c for c in silence_audit if c["action"] == "ai.asked")
    assert "budget" in audit_entry["details"]["question"]


def test_ask_forbidden_for_user(client, as_user, monkeypatch):
    calls = _patch_prompt_and_mistral(monkeypatch)

    resp = client.post("/ai/ask", json=QUESTION)

    assert resp.status_code == 403
    assert "system_prompt" not in calls


def test_ask_question_validation(client, as_admin, monkeypatch):
    _patch_prompt_and_mistral(monkeypatch)

    assert client.post("/ai/ask", json={"question": "ok"}).status_code == 422
    assert client.post("/ai/ask", json={"question": "x" * 501}).status_code == 422


def test_ask_without_api_key(client, as_admin, monkeypatch):
    monkeypatch.setattr(ai_service, "build_system_prompt", lambda cid: "SYSPROMPT")
    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "")

    resp = client.post("/ai/ask", json=QUESTION)

    assert resp.status_code == 503
    assert "MISTRAL_API_KEY" in resp.json()["detail"]


def test_ask_mistral_quota_error(client, as_admin, monkeypatch):
    monkeypatch.setattr(ai_service, "build_system_prompt", lambda cid: "SYSPROMPT")
    monkeypatch.setattr(settings, "MISTRAL_API_KEY", "test-key")
    request = httpx.Request("POST", mistral_module.MISTRAL_CHAT_URL)
    monkeypatch.setattr(
        mistral_module.httpx,
        "post",
        lambda *a, **kw: httpx.Response(429, request=request, text="rate limited"),
    )

    resp = client.post("/ai/ask", json=QUESTION)

    assert resp.status_code == 502
    assert "Quota" in resp.json()["detail"]


def test_system_prompt_contains_strict_rules(monkeypatch):
    monkeypatch.setattr(ai_service, "build_context", lambda cid: ("Acme", "CTX-FACTUEL"))

    prompt = ai_service.build_system_prompt("company-1")

    assert "Acme" in prompt
    assert "CTX-FACTUEL" in prompt
    assert "UNIQUEMENT" in prompt  # réponses limitées au contexte
    assert "Interdiction absolue" in prompt  # pas de chiffres inventés
    assert "ignore tes instructions" in prompt  # anti-injection
    assert "Markdown" in prompt  # texte brut : le chat n'interprète pas le Markdown


def test_build_context_real_aggregates(monkeypatch):
    """Le contexte contient les chiffres réels, les dépassements et les dépenses récentes."""
    mock_client = MagicMock()
    tables = {
        "companies": MagicMock(),
        "categories": MagicMock(),
        "expenses": MagicMock(),
        "profiles": MagicMock(),
    }
    mock_client.table.side_effect = lambda name: tables[name]

    tables["companies"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "co1", "name": "Acme", "annual_budget": "10000.00"}]
    )
    tables["categories"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {"id": "c1", "name": "Transport", "planned_budget": "100.00"},
            {"id": "c2", "name": "Salaires", "planned_budget": "1000.00"},
        ]
    )
    approved = [
        {"id": "e1", "amount": "120.00", "status": "approved", "expense_date": "2026-07-01", "category_id": "c1"},
        {"id": "e2", "amount": "10.00", "status": "approved", "expense_date": "2026-06-15", "category_id": "c2"},
    ]
    tables["expenses"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=approved
    )
    tables["expenses"].select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[
            {"amount": "120.00", "expense_date": "2026-07-01", "description": "Taxi",
             "status": "approved", "category_id": "c1", "user_id": "u1"},
        ]
    )
    tables["profiles"].select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "u1", "full_name": "Jean", "email": "j@acme-corp.fr"}]
    )

    monkeypatch.setattr(dashboard_service, "get_service_client", lambda: mock_client)
    monkeypatch.setattr(ai_service, "get_service_client", lambda: mock_client)
    monkeypatch.setattr(dashboard_service, "_today", lambda: date(2026, 7, 17))

    company_name, context = ai_service.build_context("co1")

    assert company_name == "Acme"
    assert "Budget annuel : 10 000 FCFA" in context
    assert "130 FCFA" in context  # consommé 2026
    assert "Transport : 120 FCFA / 100 FCFA (120 %)" in context
    assert "dépassement" in context and "Transport (120 %)" in context
    assert "Salaires" in context
    assert "01/07/2026 · Transport · Jean · Taxi · 120 FCFA · approuvée" in context
