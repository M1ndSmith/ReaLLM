from __future__ import annotations

from fastapi.testclient import TestClient
from tests.conftest import FROZEN_CATALOG

from app.application.errors import UnknownModelError
from app.application.events import StreamDelta, StreamFallback, StreamFinished, StreamStarted, StreamUsage
from app.application.models import ChatCommand, PromptMeta
from app.schemas import ChatMessage, ChatResponse, UsageInfo


def test_v1_models_shape(make_app, monkeypatch):
    app = make_app()
    monkeypatch.setattr(app.state.runtime.catalog, "list_available_models", lambda **_k: FROZEN_CATALOG)
    client = TestClient(app)
    response = client.get("/v1/models")
    assert response.status_code == 200
    body = response.json()
    assert body["object"] == "list"
    assert any(item["id"] == "groq/openai/gpt-oss-20b" and item["object"] == "model" for item in body["data"])
    assert any(item["owned_by"] == "groq" for item in body["data"])


def test_v1_chat_json_envelope_and_ignored_params(make_app, monkeypatch):
    seen = {}

    async def fake_complete(command: ChatCommand):
        seen["user_id"] = command.user_id
        seen["model"] = command.model
        return ChatResponse(
            model=command.model,
            provider="groq",
            message=ChatMessage(role="assistant", content="ok"),
            usage=UsageInfo(prompt_tokens=2, completion_tokens=2, total_tokens=4, cost_usd=0.0),
            cached=False,
        )

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "complete", fake_complete)
    client = TestClient(app)
    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "temperature": 0.2,
            "tools": [{"type": "function", "function": {"name": "x"}}],
            "n": 2,
            "user": "agent-42",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["object"] == "chat.completion"
    assert body["id"].startswith("chatcmpl-")
    assert body["choices"][0]["message"]["content"] == "ok"
    assert body["choices"][0]["finish_reason"] == "stop"
    assert body["usage"]["total_tokens"] == 4
    assert body["provider"] == "groq"
    assert seen["user_id"] == "agent-42"
    assert seen["model"] == "groq/openai/gpt-oss-20b"


def test_v1_user_id_wins_over_user(make_app, monkeypatch):
    seen = {}

    async def fake_complete(command: ChatCommand):
        seen["user_id"] = command.user_id
        return ChatResponse(
            model=command.model,
            provider="groq",
            message=ChatMessage(role="assistant", content="ok"),
        )

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "complete", fake_complete)
    client = TestClient(app)
    client.post(
        "/v1/chat/completions",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "user": "from-user",
            "user_id": "from-sidecar",
        },
    )
    assert seen["user_id"] == "from-sidecar"


def test_v1_stream_chunks(make_app, monkeypatch):
    async def fake_stream(*_a, **_k):
        model = "groq/openai/gpt-oss-20b"
        yield StreamStarted(model, "groq", None, None, None, None, None)
        yield StreamDelta("hi")
        yield StreamUsage(UsageInfo(total_tokens=5, cost_usd=None), None)
        yield StreamFinished(model=model, served=model)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    )
    assert response.status_code == 200
    text = response.text
    assert "[DONE]" in text
    assert "chat.completion.chunk" in text
    assert '"content": "hi"' in text
    assert "choices" in text


def test_v1_stream_and_schema_is_400_json(client):
    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
            "response_format": {"type": "json_object"},
        },
    )
    assert response.status_code == 400
    assert "application/json" in response.headers["content-type"]


def test_v1_unknown_model_is_400(make_app, monkeypatch):
    async def unknown(*_a, **_k):
        raise UnknownModelError("nope")

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "complete", unknown)
    client = TestClient(app)
    response = client.post(
        "/v1/chat/completions",
        json={"model": "x", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 400


def test_v1_stream_error_event(make_app, monkeypatch):
    async def fake_stream(*_a, **_k):
        raise UnknownModelError("nope")
        yield StreamStarted("x", "unknown", None, None, None, None, None)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    response = client.post(
        "/v1/chat/completions",
        json={"model": "x", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    )
    assert "error" in response.text
    assert "nope" in response.text
    assert "[DONE]" in response.text


def test_v1_json_keeps_sidecar_extras(make_app, monkeypatch):
    async def fake_complete(command: ChatCommand):
        return ChatResponse(
            model=command.model,
            provider="groq",
            message=ChatMessage(role="assistant", content="ok"),
            usage=UsageInfo(prompt_tokens=1, completion_tokens=1, total_tokens=2, cost_usd=0.01),
            cached=True,
            fallback_from="groq/openai/gpt-oss-120b",
            memories_used=2,
            pii_redacted=True,
            pii_entities=["EMAIL_ADDRESS"],
            guard_passed=True,
            schema_valid=True,
            prompt_name="chat-assistant",
            prompt_version=1,
            prompt_source="local",
        )

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "complete", fake_complete)
    client = TestClient(app)
    body = client.post(
        "/v1/chat/completions",
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]},
    ).json()
    assert body["cached"] is True
    assert body["fallback_from"] == "groq/openai/gpt-oss-120b"
    assert body["memories_used"] == 2
    assert body["cost_usd"] == 0.01
    assert body["schema_valid"] is True


def test_v1_stream_sidecar_and_fallback(make_app, monkeypatch):
    meta = PromptMeta(name="chat-assistant", version=1, source="local")

    async def fake_stream(*_a, **_k):
        requested = "groq/openai/gpt-oss-20b"
        served = "groq/openai/gpt-oss-120b"
        yield StreamStarted(requested, "groq", meta, 1, True, ["EMAIL_ADDRESS"], True)
        yield StreamDelta("hi")
        yield StreamFallback(served, "groq", requested)
        yield StreamUsage(UsageInfo(total_tokens=5, cost_usd=0.02), 0.02)
        yield StreamFinished(model=served, served=served)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    text = client.post(
        "/v1/chat/completions",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    ).text
    assert "pii_redacted" in text
    assert "chat-assistant" in text
    assert "fallback_from" in text
    assert "cost_usd" in text


def test_v1_stream_guard_blocked_error(make_app, monkeypatch):
    from app.application.errors import GuardBlockedError

    async def fake_stream(*_a, **_k):
        raise GuardBlockedError("injection", "Prompt injection blocked.")
        yield StreamStarted("x", "unknown", None, None, None, None, None)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    text = client.post(
        "/v1/chat/completions",
        json={"model": "x", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    ).text
    assert "guard_blocked" in text
    assert "Prompt injection blocked" in text


def test_native_chat_unchanged(make_app, monkeypatch):
    async def fake_complete(command: ChatCommand):
        return ChatResponse(
            model=command.model,
            provider="groq",
            message=ChatMessage(role="assistant", content="ok"),
        )

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "complete", fake_complete)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]},
    )
    body = response.json()
    assert body["message"]["content"] == "ok"
    assert "choices" not in body
