from __future__ import annotations

from fastapi.testclient import TestClient


def test_ready_ok_without_redis(client):
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["ready"] is True


def test_ready_requires_provider(monkeypatch, make_app):
    app = make_app()
    monkeypatch.setattr(app.state.runtime.catalog, "detected_providers", lambda: [])
    client = TestClient(app)
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.json()["detail"]["checks"]["providers"] is False


def test_ready_redis_degraded_behavior(monkeypatch, make_app):
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    app = make_app()
    monkeypatch.setattr(app.state.runtime.redis_health, "reachable", lambda *a, **k: False)
    client = TestClient(app)
    not_ready = client.get("/ready")
    assert not_ready.status_code == 503

    monkeypatch.setenv("READINESS_ALLOW_REDIS_DEGRADED", "1")
    app2 = make_app()
    monkeypatch.setattr(app2.state.runtime.redis_health, "reachable", lambda *a, **k: False)
    ready = TestClient(app2).get("/ready")
    assert ready.status_code == 200
    assert ready.json()["ready"] is True
