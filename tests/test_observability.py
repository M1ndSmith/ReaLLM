from __future__ import annotations

from fastapi.testclient import TestClient


def test_request_id_header_is_added(client):
    response = client.get("/health")
    assert response.status_code == 200
    request_id = response.headers.get("x-request-id")
    assert request_id is not None
    assert request_id.startswith("req_")


def test_request_id_header_echoes_valid_input(client):
    response = client.get("/health", headers={"X-Request-ID": "trace_12345678"})
    assert response.status_code == 200
    assert response.headers.get("x-request-id") == "trace_12345678"


def test_error_payload_includes_request_id(client):
    response = client.post("/chat", json={"model": "unknown", "messages": [{"role": "user", "content": "hi"}]})
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["request_id"] == response.headers.get("x-request-id")


def test_metrics_route_opt_in(monkeypatch, make_app):
    monkeypatch.setenv("OBS_METRICS", "1")
    app = make_app()
    client = TestClient(app)
    client.get("/health")
    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    assert "realmm_http_requests_total" in metrics.text


def test_metrics_route_disabled_is_404(client):
    response = client.get("/metrics")
    assert response.status_code == 404
    assert "Metrics are disabled" in str(response.json()["detail"])


def test_invalid_request_id_is_replaced(client):
    response = client.get("/health", headers={"X-Request-ID": "short"})
    assert response.status_code == 200
    request_id = response.headers.get("x-request-id")
    assert request_id is not None
    assert request_id.startswith("req_")


def test_correlation_id_header_is_accepted(client):
    response = client.get("/health", headers={"X-Correlation-ID": "trace_abcdef"})
    assert response.status_code == 200
    assert response.headers.get("x-request-id") == "trace_abcdef"


def test_identity_metrics_increment_on_chat(monkeypatch, make_app):
    monkeypatch.setenv("OBS_METRICS", "1")
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    app = make_app()

    async def fake_complete(command):
        from app.schemas import ChatMessage, ChatResponse

        return ChatResponse(
            model=command.model,
            provider="groq",
            message=ChatMessage(role="assistant", content="ok"),
        )

    app.state.runtime.chat.complete = fake_complete  # type: ignore[method-assign]
    client = TestClient(app)
    headers = {"Authorization": "Bearer secret-gateway"}
    chat = client.post(
        "/chat",
        headers=headers,
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert chat.status_code == 200
    assert chat.headers.get("x-gateway-key-id") == "default"
    metrics = client.get("/metrics", headers=headers)
    assert metrics.status_code == 200
    assert "realmm_identity_requests_total" in metrics.text
    assert "realmm_chat_requests_total" in metrics.text


def test_identity_metrics_increment_on_embeddings(monkeypatch, make_app):
    monkeypatch.setenv("OBS_METRICS", "1")
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    app = make_app()

    async def fake_embed(**kwargs):
        return {
            "object": "list",
            "model": kwargs["model"],
            "data": [{"object": "embedding", "embedding": [0.1], "index": 0}],
            "usage": {"prompt_tokens": 1, "total_tokens": 1},
        }

    app.state.runtime.router.aembedding = fake_embed  # type: ignore[method-assign]
    monkeypatch.setattr(app.state.runtime.budget, "completion_usd", lambda *_a, **_k: None)
    client = TestClient(app)
    headers = {"Authorization": "Bearer secret-gateway"}
    response = client.post(
        "/v1/embeddings",
        headers=headers,
        json={"model": "groq/openai/gpt-oss-20b", "input": "hello"},
    )
    assert response.status_code == 200
    metrics = client.get("/metrics", headers=headers)
    assert metrics.status_code == 200
    assert "realmm_embedding_requests_total" in metrics.text
    assert "v1_embeddings" in metrics.text


def test_metric_route_label_uses_template_not_raw_id():
    from starlette.requests import Request

    from app.api.middleware.request_context import metric_route_label

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/admin/keys/alpha",
        "raw_path": b"/admin/keys/alpha",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 123),
        "server": ("127.0.0.1", 80),
        "route": type("Route", (), {"path": "/admin/keys/{key_id}"})(),
    }
    assert metric_route_label(Request(scope)) == "admin_keys_key_id"
    scope["route"] = None
    assert metric_route_label(Request(scope)) == "unmatched"


def test_metrics_collapse_dynamic_paths(monkeypatch, make_app):
    monkeypatch.setenv("OBS_METRICS", "1")
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    app = make_app()
    client = TestClient(app)
    headers = {"Authorization": "Bearer secret-gateway"}
    client.patch("/admin/keys/alpha", headers=headers, json={"label": "a"})
    client.patch("/admin/keys/beta", headers=headers, json={"label": "b"})
    client.get("/definitely-missing-path-xyz", headers=headers)
    metrics = client.get("/metrics", headers=headers)
    assert metrics.status_code == 200
    text = metrics.text
    assert "admin_keys_key_id" in text
    assert "admin_keys_alpha" not in text
    assert "admin_keys_beta" not in text
    assert "unmatched" in text
    assert "definitely_missing_path_xyz" not in text
