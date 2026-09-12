from __future__ import annotations

from app.infrastructure.budget import BudgetRuntime
from app.infrastructure.catalog import ProviderCatalog
from app.infrastructure.redis_health import RedisHealth
from app.infrastructure.router import LiteLLMRouterRuntime
from app.settings import GatewaySettings


def test_router_falls_back_local_when_redis_unreachable(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    settings = GatewaySettings()
    redis_health = RedisHealth(settings)
    monkeypatch.setattr(redis_health, "mode", lambda: "local")
    monkeypatch.setattr(redis_health, "reachable", lambda *a, **k: False)
    runtime = LiteLLMRouterRuntime(settings, ProviderCatalog(settings), redis_health=redis_health)
    assert runtime._redis_kwargs() == {}
    assert runtime.reliability_status().redis_mode == "local"


def test_budget_uses_file_when_redis_unreachable(monkeypatch, tmp_path):
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    settings = GatewaySettings()
    redis_health = RedisHealth(settings)
    monkeypatch.setattr(redis_health, "reachable", lambda *a, **k: False)
    budget = BudgetRuntime(settings, state_path=tmp_path / "budget-state.json", redis_health=redis_health)
    assert budget.ledger_backend() == "file"
    budget.record_usage(tokens=3, usd=0.1, cached=False)
    assert budget.status().daily_tokens == 3
    budget.record_usage(tokens=2, usd=0.05, cached=False, identity_id="agent-a")
    from app.application.models import IdentityQuotas

    budget.assert_allowed(
        "groq/openai/gpt-oss-20b",
        1,
        identity_id="agent-a",
        quotas=IdentityQuotas(daily_token_budget=10),
    )


def test_live_redis_identity_ledger_if_available(monkeypatch, tmp_path):
    import os

    import pytest

    url = os.getenv("TEST_REDIS_URL")
    if not url:
        pytest.skip("TEST_REDIS_URL not set")
    try:
        import redis as redis_lib

        redis_lib.Redis.from_url(url).ping()
    except Exception:
        pytest.skip("redis unavailable")
    monkeypatch.setenv("REDIS_URL", url)
    from app.application.models import IdentityQuotas
    from app.infrastructure.budget import BudgetRuntime
    from app.settings import GatewaySettings

    budget = BudgetRuntime(GatewaySettings(), state_path=tmp_path / "live-budget.json")
    identity = f"ci-{tmp_path.name}"
    budget.record_usage(tokens=2, usd=0.01, cached=False, identity_id=identity)
    budget.assert_allowed("m", 1, identity_id=identity, quotas=IdentityQuotas(daily_token_budget=20))
