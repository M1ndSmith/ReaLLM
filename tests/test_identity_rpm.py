from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from tests.fakes import FakeResponse
from tests.test_budget import FakeRedis

from app.application.errors import IdentityRateLimitError
from app.application.models import IdentityQuotas
from app.infrastructure.budget import BudgetRuntime
from app.settings import GatewaySettings


def test_identity_rpm_in_process_window(tmp_path):
    budget = BudgetRuntime(GatewaySettings(), state_path=tmp_path / "budget-rpm.json")
    budget.assert_rpm("agent-a", 2)
    budget.assert_rpm("agent-a", 2)
    with pytest.raises(IdentityRateLimitError):
        budget.assert_rpm("agent-a", 2)
    budget.assert_rpm("agent-b", 2)


def test_identity_rpm_redis_window(monkeypatch, tmp_path):
    fake = FakeRedis()
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    budget = BudgetRuntime(GatewaySettings(), state_path=tmp_path / "budget-rpm-redis.json")
    monkeypatch.setattr(budget, "_get_redis", lambda: fake)
    budget.assert_rpm("agent-a", 1)
    with pytest.raises(IdentityRateLimitError):
        budget.assert_rpm("agent-a", 1)


def test_identity_rpm_http_429(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    app = make_app()
    _identity, issued = app.state.runtime.identities.create(
        key_id="busy",
        scopes=["chat", "read"],
        quotas=IdentityQuotas(rpm_limit=1),
    )

    async def fake_completion(**kwargs):
        return FakeResponse("ok", model=kwargs["model"])

    monkeypatch.setattr(app.state.runtime.router, "acompletion", fake_completion)
    monkeypatch.setattr(app.state.runtime.budget, "completion_usd", lambda *_a, **_k: None)
    client = TestClient(app)
    payload = {"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]}
    headers = {"Authorization": f"Bearer {issued}"}
    first = client.post("/chat", headers=headers, json=payload)
    assert first.status_code == 200
    second = client.post("/chat", headers=headers, json=payload)
    assert second.status_code == 429
    assert "busy" in str(second.json()["detail"])
