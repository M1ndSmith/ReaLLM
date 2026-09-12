from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.dependencies import require_scopes


def _auth_app(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    app = make_app()
    return app, TestClient(app)


def test_read_only_key_cannot_chat_or_patch_config(monkeypatch, make_app):
    app, client = _auth_app(monkeypatch, make_app)
    _identity, issued = app.state.runtime.identities.create(key_id="reader", scopes=["read"], label="Reader")
    headers = {"Authorization": f"Bearer {issued}"}
    assert client.get("/health", headers=headers).status_code == 200
    assert client.get("/models", headers=headers).status_code == 200
    denied_chat = client.post(
        "/chat",
        headers=headers,
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert denied_chat.status_code == 403
    assert denied_chat.json()["detail"]["required_scope"] == "chat"
    denied_config = client.patch("/config", headers=headers, json={"layers": {"memory": True}})
    assert denied_config.status_code == 403
    assert denied_config.json()["detail"]["required_scope"] == "config"
    denied_admin = client.get("/admin/keys", headers=headers)
    assert denied_admin.status_code == 403


def test_chat_key_can_complete_and_list_openai_models(monkeypatch, make_app):
    app, client = _auth_app(monkeypatch, make_app)
    _identity, issued = app.state.runtime.identities.create(key_id="chatter", scopes=["chat"], label="Chat")
    headers = {"Authorization": f"Bearer {issued}"}
    models = client.get("/v1/models", headers=headers)
    assert models.status_code == 200
    denied_health = client.get("/health", headers=headers)
    assert denied_health.status_code == 403
    assert denied_health.json()["detail"]["required_scope"] == "read"

    async def fake_complete(command):
        from app.schemas import ChatMessage, ChatResponse

        return ChatResponse(
            model=command.model,
            provider="groq",
            message=ChatMessage(role="assistant", content="ok"),
        )

    app.state.runtime.chat.complete = fake_complete  # type: ignore[method-assign]
    chat = client.post(
        "/chat",
        headers=headers,
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert chat.status_code == 200
    assert client.get("/config", headers=headers).status_code == 200


def test_config_scope_required_for_layer_patch(monkeypatch, make_app):
    app, client = _auth_app(monkeypatch, make_app)
    _identity, issued = app.state.runtime.identities.create(key_id="ops", scopes=["config", "read"], label="Ops")
    headers = {"Authorization": f"Bearer {issued}"}
    patched = client.patch("/config", headers=headers, json={"layers": {"pii": True}})
    assert patched.status_code == 200
    assert patched.json()["layers"]["pii"] is True


def test_auth_off_skips_scope_checks(client):
    assert client.get("/health").status_code == 200
    assert client.get("/ready").status_code == 200


def test_require_scopes_401_when_auth_on_without_identity(monkeypatch, make_app):
    app, _client = _auth_app(monkeypatch, make_app)
    request = SimpleNamespace(state=SimpleNamespace(gateway_identity=None))
    check = require_scopes("read")
    with pytest.raises(HTTPException) as exc:
        check(request, runtime=app.state.runtime)
    assert exc.value.status_code == 401
    assert exc.value.detail["error"] == "gateway_unauthorized"
