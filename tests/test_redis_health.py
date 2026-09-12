from __future__ import annotations

import builtins

from app.infrastructure.redis_health import RedisHealth
from app.settings import GatewaySettings


class _PingClient:
    def __init__(self, *, fail: bool = False):
        self.fail = fail
        self.calls = 0

    def ping(self):
        self.calls += 1
        if self.fail:
            raise RuntimeError("down")


def test_configured_and_unconfigured_modes(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    health = RedisHealth(GatewaySettings())
    assert health.configured() is False
    assert health.mode() == "unconfigured"
    assert health.redis_kwargs() == {}


def test_build_client_returns_none_when_redis_import_missing(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "redis":
            raise ImportError("redis missing")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    health = RedisHealth(GatewaySettings())
    assert health._build_client() is None


def test_reachable_uses_cache_and_refresh(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    health = RedisHealth(GatewaySettings())
    client = _PingClient()
    monkeypatch.setattr(health, "_build_client", lambda: client)

    assert health.reachable() is True
    assert client.calls == 1
    assert health.reachable() is True
    assert client.calls == 1
    assert health.reachable(refresh=True) is True
    assert client.calls == 2


def test_reachable_failure_resets_client(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    health = RedisHealth(GatewaySettings())
    client = _PingClient(fail=True)
    monkeypatch.setattr(health, "_build_client", lambda: client)

    assert health.reachable() is False
    assert health._client is None
    assert health.mode() == "local"


def test_redis_kwargs_only_when_shared(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    health = RedisHealth(GatewaySettings())
    monkeypatch.setattr(health, "reachable", lambda *args, **kwargs: True)
    assert health.mode() == "shared"
    assert health.redis_kwargs() == {"redis_url": "redis://localhost:6379/0"}

    monkeypatch.setattr(health, "reachable", lambda *args, **kwargs: False)
    assert health.mode() == "local"
    assert health.redis_kwargs() == {}
