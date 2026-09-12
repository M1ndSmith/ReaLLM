from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.auth import _keys_match


def test_auth_off_leaves_json_routes_open(client):
    assert client.get("/health").status_code == 200
    assert client.get("/healthz").status_code == 200
    assert client.get("/").status_code == 200


def test_auth_on_rejects_missing_and_wrong_key(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    client = TestClient(make_app())
    assert client.get("/").status_code == 200
    assert client.get("/healthz").status_code == 200
    denied = client.get("/health")
    assert denied.status_code == 401
    assert denied.json()["detail"]["error"] == "gateway_unauthorized"

    wrong = client.get("/health", headers={"Authorization": "Bearer nope"})
    assert wrong.status_code == 401
    assert wrong.json()["detail"]["error"] == "gateway_unauthorized"

    chat = client.post("/chat", json={"model": "x", "messages": [{"role": "user", "content": "hi"}]})
    assert chat.status_code == 401


def test_auth_on_accepts_bearer_and_x_api_key(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    client = TestClient(make_app())
    headers = {"Authorization": "Bearer secret-gateway"}
    assert client.get("/health", headers=headers).status_code == 200
    assert client.get("/models", headers={"X-Api-Key": "secret-gateway"}).status_code == 200
    assert client.get("/v1/models", headers=headers).status_code == 200


def test_auth_compare_digest_mismatch(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "expected-key")
    assert _keys_match("expected-key", "expected-key") is True
    assert _keys_match("wrong-key", "expected-key") is False
    client = TestClient(make_app())
    assert client.get("/health", headers={"Authorization": "Bearer expected-key"}).status_code == 200
    assert client.get("/health", headers={"Authorization": "Bearer expected-keyx"}).status_code == 401


def test_cors_preflight_allows_authorization(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    client = TestClient(make_app())
    response = client.options(
        "/chat",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_log_auth_status(monkeypatch, caplog, tmp_path):
    import logging

    from tests.factories import runtime

    caplog.set_level(logging.INFO)
    monkeypatch.delenv("GATEWAY_API_KEY", raising=False)
    import asyncio

    asyncio.run(runtime(tmp_path).start())
    assert "gateway auth: off" in caplog.text
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    caplog.clear()
    asyncio.run(runtime(tmp_path / "on").start())
    assert "gateway auth: on" in caplog.text
