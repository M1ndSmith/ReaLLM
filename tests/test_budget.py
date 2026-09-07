from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.application.errors import BudgetExceededError, InputTooLargeError
from app.infrastructure.budget import BudgetRuntime, model_priced
from app.schemas import ChatMessage, UsageInfo
from app.settings import GatewaySettings


class FakePipe:
    def __init__(self, store: dict):
        self.store = store

    def hincrby(self, key, field, amount):
        row = self.store.setdefault(key, {})
        row[field] = int(float(row.get(field, 0) or 0)) + int(amount)

    def hincrbyfloat(self, key, field, amount):
        row = self.store.setdefault(key, {})
        row[field] = float(row.get(field, 0) or 0) + float(amount)

    def expire(self, key, ttl):
        return True

    def execute(self):
        return True


class FakeRedis:
    def __init__(self):
        self.store: dict = {}

    def pipeline(self):
        return FakePipe(self.store)

    def hgetall(self, key):
        return dict(self.store.get(key, {}))

    def ping(self):
        return True


def _budget(tmp_path) -> BudgetRuntime:
    return BudgetRuntime(GatewaySettings(), state_path=tmp_path / "budget-state.json")


def test_input_and_daily_token_caps(monkeypatch, tmp_path):
    monkeypatch.setenv("MAX_INPUT_TOKENS", "10")
    budget = _budget(tmp_path)
    with pytest.raises(InputTooLargeError):
        budget.assert_allowed("groq/openai/gpt-oss-20b", 11)
    monkeypatch.delenv("MAX_INPUT_TOKENS")
    monkeypatch.setenv("DAILY_TOKEN_BUDGET", "5")
    budget = _budget(tmp_path)
    budget.assert_allowed("groq/openai/gpt-oss-20b", 5)
    budget.record_usage(tokens=4, usd=None, cached=False)
    with pytest.raises(BudgetExceededError):
        budget.assert_allowed("groq/openai/gpt-oss-20b", 3)


def test_daily_usd_cap(monkeypatch, tmp_path):
    monkeypatch.setenv("DAILY_USD_BUDGET", "0.01")
    budget = _budget(tmp_path)
    monkeypatch.setattr("app.infrastructure.budget.model_priced", lambda _model: True)
    monkeypatch.setattr(budget, "estimated_input_usd", lambda _model, _tokens: 1.0)
    with pytest.raises(BudgetExceededError):
        budget.assert_allowed("openai/gpt-4o-mini", 10)


def test_file_ledger_skips_cache_hits(tmp_path):
    budget = _budget(tmp_path)
    budget.record_usage(tokens=9, usd=0.5, cached=True)
    assert budget.status().daily_tokens == 0
    budget.record_usage(tokens=9, usd=None, cached=False)
    status = budget.status()
    assert status.daily_tokens == 9
    assert status.ledger == "file"
    assert budget.ledger_backend() == "file"
    from app.infrastructure.budget import _utc_day

    loaded = budget._load_file_state(_utc_day())
    assert loaded["tokens"] == 9


def test_redis_ledger(monkeypatch, tmp_path):
    fake = FakeRedis()
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    budget = _budget(tmp_path)
    monkeypatch.setattr(budget, "_get_redis", lambda: fake)
    budget.record_usage(tokens=11, usd=0.25, cached=False)
    status = budget.status()
    assert status.daily_tokens == 11
    assert abs(status.daily_usd - 0.25) < 1e-9
    assert status.ledger == "redis"


def test_redis_unreachable_falls_back_to_file(monkeypatch, tmp_path):
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:1/0")

    class Boom:
        @staticmethod
        def from_url(*_a, **_k):
            raise ConnectionError("down")

    import redis as redis_lib

    monkeypatch.setattr(redis_lib, "Redis", Boom)
    budget = _budget(tmp_path)
    assert budget._get_redis() is None
    assert budget.ledger_backend() == "file"


def test_redis_retries_after_transient_failure(monkeypatch, tmp_path):
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    calls = {"n": 0}
    fake = FakeRedis()

    class Flaky:
        @staticmethod
        def from_url(*_a, **_k):
            calls["n"] += 1
            if calls["n"] == 1:
                raise ConnectionError("down")
            return fake

    import redis as redis_lib

    monkeypatch.setattr(redis_lib, "Redis", Flaky)
    budget = _budget(tmp_path)
    assert budget._get_redis() is None
    assert budget._get_redis() is fake
    assert budget.ledger_backend() == "redis"


def test_model_priced_and_costs(monkeypatch, tmp_path):
    import litellm

    monkeypatch.setattr(
        litellm,
        "model_cost",
        {"gpt-4o-mini": {"input_cost_per_token": 0.000001, "output_cost_per_token": 0.000002}},
    )
    assert model_priced("openai/gpt-4o-mini") is True
    monkeypatch.setattr(litellm, "model_cost", {"x": {"input_cost_per_token": 0, "output_cost_per_token": 0}})
    assert model_priced("x") is False
    budget = _budget(tmp_path)
    assert budget.attach_cost(None, None) is None
    usage = budget.attach_cost(UsageInfo(total_tokens=3), 0.01)
    assert usage is not None and usage.cost_usd == 0.01
    assert budget.completion_usd(object(), "unknown-model") is None


def test_token_count_fallback(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.infrastructure.budget.token_counter", lambda **_k: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    budget = _budget(tmp_path)
    n = budget.token_count("groq/openai/gpt-oss-20b", [ChatMessage(role="user", content="abcd" * 8)])
    assert n >= 1
    assert budget.token_count_text("m", "") == 0
    assert budget.token_count_text("m", "hello world") >= 1
    usage = budget.usage_from_counts("m", 3, 2)
    assert usage.total_tokens == 5
    assert budget.max_output_tokens() == 2048


def test_file_corrupt_and_redis_write_fallback(monkeypatch, tmp_path):
    from app.infrastructure.budget import _utc_day

    path = tmp_path / "budget-state.json"
    path.write_text("{not json", encoding="utf-8")
    budget = BudgetRuntime(GatewaySettings(), state_path=path)
    state = budget._load_file_state(_utc_day())
    assert state["tokens"] == 0

    class BoomRedis:
        def pipeline(self):
            raise RuntimeError("pipe down")

        def hgetall(self, key):
            raise RuntimeError("read down")

    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    budget = BudgetRuntime(GatewaySettings(), state_path=path)
    monkeypatch.setattr(budget, "_get_redis", lambda: BoomRedis())
    budget.record_usage(tokens=3, usd=None, cached=False)
    assert budget.status().daily_tokens == 3


def test_completion_usd_and_usage_counts(monkeypatch, tmp_path):
    import litellm

    monkeypatch.setattr(
        litellm,
        "model_cost",
        {"gpt-4o-mini": {"input_cost_per_token": 0.000001, "output_cost_per_token": 0.000002}},
    )
    monkeypatch.setattr("app.infrastructure.budget.completion_cost", lambda **_k: 0.04)
    budget = _budget(tmp_path)
    resp = SimpleNamespace(_hidden_params={"response_cost": 0.02})
    assert budget.completion_usd(resp, "openai/gpt-4o-mini") == 0.04
    monkeypatch.setattr("app.infrastructure.budget.cost_per_token", lambda **_k: (0.01, 0.02))
    assert budget.usd_from_tokens("openai/gpt-4o-mini", 10, 5) == 0.03
    usage = budget.usage_from_counts("openai/gpt-4o-mini", 10, None)
    assert usage.total_tokens == 10
    usage = budget.usage_from_counts("m", None, 4)
    assert usage.total_tokens == 4
    assert budget.attach_cost(None, 0.2).cost_usd == 0.2
