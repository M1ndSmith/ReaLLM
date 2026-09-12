from __future__ import annotations

from fastapi.testclient import TestClient
from tests.fakes import FakeResponse

from app.application.errors import BudgetExceededError
from app.application.models import IdentityQuotas
from app.infrastructure.budget import BudgetRuntime
from app.settings import GatewaySettings


def test_identity_token_budget_is_isolated(tmp_path):
    budget = BudgetRuntime(GatewaySettings(), state_path=tmp_path / "budget-state.json")
    quotas = IdentityQuotas(daily_token_budget=5)
    budget.assert_allowed("groq/openai/gpt-oss-20b", 4, identity_id="agent-a", quotas=quotas)
    budget.record_usage(tokens=4, usd=None, cached=False, identity_id="agent-a")
    try:
        budget.assert_allowed("groq/openai/gpt-oss-20b", 3, identity_id="agent-a", quotas=quotas)
        raise AssertionError("expected BudgetExceededError")
    except BudgetExceededError as exc:
        assert "agent-a" in str(exc)
    budget.assert_allowed("groq/openai/gpt-oss-20b", 3, identity_id="agent-b", quotas=quotas)


def test_identity_usd_budget_blocks(monkeypatch, tmp_path):
    budget = BudgetRuntime(GatewaySettings(), state_path=tmp_path / "budget-usd.json")
    monkeypatch.setattr(budget, "estimated_input_usd", lambda _model, _tokens: 1.0)
    quotas = IdentityQuotas(daily_usd_budget=0.5)
    try:
        budget.assert_allowed("openai/gpt-4o-mini", 10, identity_id="agent-a", quotas=quotas)
        raise AssertionError("expected BudgetExceededError")
    except BudgetExceededError as exc:
        assert "USD" in str(exc)


def test_identity_budget_http_enforcement(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    app = make_app()
    _identity, issued = app.state.runtime.identities.create(
        key_id="capped",
        scopes=["chat", "read"],
        quotas=IdentityQuotas(daily_token_budget=5),
    )

    async def fake_completion(**kwargs):
        return FakeResponse("ok", model=kwargs["model"])

    monkeypatch.setattr(app.state.runtime.router, "acompletion", fake_completion)
    monkeypatch.setattr(app.state.runtime.budget, "token_count", lambda *_a, **_k: 6)
    monkeypatch.setattr(app.state.runtime.budget, "completion_usd", lambda *_a, **_k: None)
    client = TestClient(app)
    response = client.post(
        "/chat",
        headers={"Authorization": f"Bearer {issued}"},
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 402
    assert "capped" in str(response.json()["detail"])
