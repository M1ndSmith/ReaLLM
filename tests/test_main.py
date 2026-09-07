from __future__ import annotations

from fastapi.testclient import TestClient
from tests.conftest import FROZEN_CATALOG

from app.application.errors import BudgetExceededError, UnknownModelError
from app.application.events import StreamDelta, StreamFallback, StreamFinished, StreamStarted, StreamUsage
from app.application.models import ChatCommand, PromptMeta
from app.schemas import (
    BudgetInfo,
    ChatMessage,
    ChatResponse,
    ReliabilityInfo,
    UsageInfo,
)


def test_health_and_catalog(make_app, monkeypatch):
    app = make_app()
    monkeypatch.setattr(
        app.state.runtime.router,
        "reliability_status",
        lambda: ReliabilityInfo(
            retries=2,
            cache=True,
            cache_ttl=120,
            redis=False,
            fallback_policy="same-provider",
            fallbacks=["groq/openai/gpt-oss-120b"],
            routing_strategy="simple-shuffle",
        ),
    )
    monkeypatch.setattr(
        app.state.runtime.budget,
        "status",
        lambda: BudgetInfo(daily_tokens=0, daily_usd=0.0, max_output_tokens=2048, ledger="file"),
    )
    monkeypatch.setattr(app.state.runtime.prompts, "prompts_enabled", lambda: False)
    monkeypatch.setattr(app.state.runtime.prompts, "prompts_source", lambda: "local")
    monkeypatch.setattr(app.state.runtime.prompts, "tracing_enabled", lambda: False)
    client = TestClient(app)
    health = client.get("/health")
    assert health.status_code == 200
    body = health.json()
    assert body["status"] == "ok"
    assert body["reliability"]["fallback_policy"] == "same-provider"
    assert body["prompts"]["tracing"] is False
    assert body["budget"]["ledger"] == "file"
    assert body["pii"]["enabled"] is False
    assert body["guard"]["enabled"] is False
    assert body["guard"]["content_ignore"] == []

    monkeypatch.setattr(app.state.runtime.catalog, "detected_providers", lambda: ["groq", "openai"])
    monkeypatch.setattr(app.state.runtime.catalog, "list_available_models", lambda **_k: FROZEN_CATALOG)
    providers = client.get("/providers")
    assert providers.json()["providers"] == ["groq", "openai"]
    models = client.get("/models")
    assert any(item["id"] == "groq/openai/gpt-oss-20b" for item in models.json()["models"])
    prompts = client.get("/prompts")
    assert any(item["name"] == "chat-assistant" for item in prompts.json()["prompts"])
    budget = client.get("/budget")
    assert budget.status_code == 200


def test_chat_json_success_and_errors(make_app, monkeypatch):
    app = make_app()

    async def fake_complete(command: ChatCommand):
        return ChatResponse(
            model=command.model,
            provider="groq",
            message=ChatMessage(role="assistant", content="ok"),
            usage=UsageInfo(total_tokens=4),
        )

    monkeypatch.setattr(app.state.runtime.chat, "complete", fake_complete)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 200
    assert response.json()["message"]["content"] == "ok"

    async def unknown(*_a, **_k):
        raise UnknownModelError("nope")

    monkeypatch.setattr(app.state.runtime.chat, "complete", unknown)
    assert client.post("/chat", json={"model": "x", "messages": [{"role": "user", "content": "hi"}]}).status_code == 400

    async def broke(*_a, **_k):
        raise BudgetExceededError("cap")

    monkeypatch.setattr(app.state.runtime.chat, "complete", broke)
    assert client.post("/chat", json={"model": "x", "messages": [{"role": "user", "content": "hi"}]}).status_code == 402


async def _stream_ok(*_a, **_k):
    model = "groq/openai/gpt-oss-20b"
    yield StreamStarted(model, "groq", None, None, None, None, None)
    yield StreamDelta("hi")
    yield StreamUsage(UsageInfo(total_tokens=5, cost_usd=None), None)
    yield StreamFinished(model=model, served=model)


def test_chat_sse(make_app, monkeypatch):
    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", _stream_ok)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    )
    assert response.status_code == 200
    text = response.text
    assert "data:" in text
    assert "[DONE]" in text
    assert "hi" in text


def test_memory_disabled_is_503(client):
    response = client.get("/memory", params={"q": "tea"})
    assert response.status_code == 503
    assert client.post("/memory", json={"messages": [{"role": "user", "content": "x"}]}).status_code == 503
    assert client.delete("/memory/abc").status_code == 503


def test_index_and_chat_http_errors(make_app, monkeypatch):
    from litellm.exceptions import APIError, AuthenticationError, BadRequestError, RateLimitError

    from app.application.errors import InputTooLargeError, UnknownPromptError

    app = make_app()
    client = TestClient(app)
    index = client.get("/")
    assert index.status_code == 200

    payload = {"model": "x", "messages": [{"role": "user", "content": "hi"}]}

    async def prompt_err(*_a, **_k):
        raise UnknownPromptError("missing")

    monkeypatch.setattr(app.state.runtime.chat, "complete", prompt_err)
    assert client.post("/chat", json=payload).status_code == 400

    async def too_big(*_a, **_k):
        raise InputTooLargeError("big")

    monkeypatch.setattr(app.state.runtime.chat, "complete", too_big)
    assert client.post("/chat", json=payload).status_code == 400

    async def auth(*_a, **_k):
        raise AuthenticationError("nope", "groq", "x")

    monkeypatch.setattr(app.state.runtime.chat, "complete", auth)
    assert client.post("/chat", json=payload).status_code == 401

    async def limited(*_a, **_k):
        raise RateLimitError("slow", "groq", "x")

    monkeypatch.setattr(app.state.runtime.chat, "complete", limited)
    assert client.post("/chat", json=payload).status_code == 429

    async def bad(*_a, **_k):
        raise BadRequestError("bad", "x", "groq")

    monkeypatch.setattr(app.state.runtime.chat, "complete", bad)
    assert client.post("/chat", json=payload).status_code == 400

    async def down(*_a, **_k):
        raise APIError(502, "down", "groq", "x")

    monkeypatch.setattr(app.state.runtime.chat, "complete", down)
    assert client.post("/chat", json=payload).status_code == 502


def test_memory_routes_when_enabled(monkeypatch, tmp_path, make_app):
    monkeypatch.setenv("MEMORY", "1")
    app = make_app()

    async def fake_search(*_a, **_k):
        from app.schemas import MemoryHit

        return [MemoryHit(id="1", memory="tea", score=0.2)]

    async def fake_add(*_a, **_k):
        return {"results": [{"memory": "saved"}]}

    async def fake_delete(*_a, **_k):
        return None

    monkeypatch.setattr(app.state.runtime.memory, "search", fake_search)
    monkeypatch.setattr(app.state.runtime.memory, "add", fake_add)
    monkeypatch.setattr(app.state.runtime.memory, "delete", fake_delete)
    client = TestClient(app)
    assert client.get("/memory", params={"q": "tea"}).status_code == 200
    added = client.post("/memory", json={"messages": [{"role": "user", "content": "x"}]})
    assert added.status_code == 200
    assert client.delete("/memory/1").json()["status"] == "deleted"


def test_memory_routes_redact_when_pii_on(monkeypatch, make_app):
    monkeypatch.setenv("MEMORY", "1")
    monkeypatch.setenv("PII", "1")
    app = make_app()
    seen = {}

    async def fake_search(q, **_k):
        from app.schemas import MemoryHit

        seen["q"] = q
        return [MemoryHit(id="1", memory="user@example.com", score=0.2)]

    async def fake_add(messages, **_k):
        seen["add"] = messages[0].content
        return {"results": [{"memory": "user@example.com"}]}

    async def fake_redact_text(text):
        return text.replace("user@example.com", "<EMAIL_ADDRESS>"), ["EMAIL_ADDRESS"]

    async def fake_redact_messages(messages):
        out = [
            ChatMessage(role=item.role, content=item.content.replace("user@example.com", "<EMAIL_ADDRESS>"))
            for item in messages
        ]
        return out, ["EMAIL_ADDRESS"]

    monkeypatch.setattr(app.state.runtime.memory, "search", fake_search)
    monkeypatch.setattr(app.state.runtime.memory, "add", fake_add)
    monkeypatch.setattr(app.state.runtime.pii, "redact_text", fake_redact_text)
    monkeypatch.setattr(app.state.runtime.pii, "redact_messages", fake_redact_messages)

    async def fake_redact_hits(hits):
        from app.schemas import MemoryHit

        return [MemoryHit(id=hit.id, memory="<EMAIL_ADDRESS>", score=hit.score) for hit in hits]

    async def fake_redact_rows(rows):
        out = []
        for row in rows:
            item = dict(row)
            if item.get("memory") == "user@example.com":
                item["memory"] = "<EMAIL_ADDRESS>"
            out.append(item)
        return out

    monkeypatch.setattr(app.state.runtime.pii, "redact_hits", fake_redact_hits)
    monkeypatch.setattr(app.state.runtime.pii, "redact_result_rows", fake_redact_rows)
    client = TestClient(app)
    searched = client.get("/memory", params={"q": "user@example.com"})
    assert searched.status_code == 200
    assert seen["q"] == "<EMAIL_ADDRESS>"
    assert searched.json()["results"][0]["memory"] == "<EMAIL_ADDRESS>"
    added = client.post("/memory", json={"messages": [{"role": "user", "content": "user@example.com"}]})
    assert added.status_code == 200
    assert seen["add"] == "<EMAIL_ADDRESS>"
    assert added.json()["results"][0]["memory"] == "<EMAIL_ADDRESS>"


def test_memory_pii_config_error_is_503(monkeypatch, tmp_path, make_app):
    from app.application.errors import PiiConfigError

    monkeypatch.setenv("MEMORY", "1")
    monkeypatch.setenv("PII", "1")
    app = make_app()

    async def boom(text):
        raise PiiConfigError("PII is enabled but Presidio failed to load")

    monkeypatch.setattr(app.state.runtime.pii, "redact_text", boom)
    client = TestClient(app)
    assert client.get("/memory", params={"q": "tea"}).status_code == 503


def test_chat_pii_config_error_is_503(make_app, monkeypatch):
    from app.application.errors import PiiConfigError

    app = make_app()

    async def boom(*_a, **_k):
        raise PiiConfigError("PII is enabled but Presidio failed to load")

    monkeypatch.setattr(app.state.runtime.chat, "complete", boom)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 503


def test_sse_includes_pii_flag(make_app, monkeypatch):
    async def fake_stream(*_a, **_k):
        model = "groq/openai/gpt-oss-20b"
        yield StreamStarted(model, "groq", None, None, True, ["EMAIL_ADDRESS"], None)
        yield StreamDelta("<EMAIL_ADDRESS>")
        yield StreamUsage(UsageInfo(total_tokens=5, cost_usd=None), None)
        yield StreamFinished(model=model, served=model)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    )
    assert '"pii_redacted": true' in response.text
    assert "EMAIL_ADDRESS" in response.text


def test_sse_includes_fallback_and_prompt_meta(make_app, monkeypatch):
    meta = PromptMeta(name="chat-assistant", version=1, source="local")
    requested = "groq/openai/gpt-oss-20b"
    served = "groq/openai/gpt-oss-120b"

    async def fake_stream(*_a, **_k):
        yield StreamStarted(requested, "groq", meta, 2, None, None, None)
        yield StreamDelta("hi")
        yield StreamFallback(served, "groq", requested)
        yield StreamUsage(UsageInfo(total_tokens=5, cost_usd=None), None)
        yield StreamFinished(model=served, served=served)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={
            "model": requested,
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    )
    text = response.text
    assert response.status_code == 200
    assert '"fallback_from": "groq/openai/gpt-oss-20b"' in text
    assert '"prompt_name": "chat-assistant"' in text
    assert '"prompt_source": "local"' in text
    assert '"memories_used": 2' in text
    assert "[DONE]" in text


def test_sse_error_event(make_app, monkeypatch):
    async def fake_stream(*_a, **_k):
        raise UnknownModelError("nope")
        yield StreamStarted("x", "unknown", None, None, None, None, None)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "x", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    )
    assert "error" in response.text


def test_sse_pii_config_error(make_app, monkeypatch):
    from app.application.errors import PiiConfigError

    async def fake_stream(*_a, **_k):
        raise PiiConfigError("PII is enabled but Presidio failed to load")
        yield StreamStarted("x", "unknown", None, None, None, None, None)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "x", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    )
    assert "PII is enabled" in response.text


def test_memory_write_guard_blocked_is_400(monkeypatch, make_app):
    from app.application.errors import GuardBlockedError

    async def blocked(_messages, _flags):
        raise GuardBlockedError("content", "Unsafe content blocked (S10).", ["S10"], ["Hate"])

    monkeypatch.setenv("MEMORY", "1")
    monkeypatch.setenv("GUARD", "1")
    app = make_app()
    monkeypatch.setattr(app.state.runtime.guards, "assert_memory_write", blocked)
    client = TestClient(app)
    response = client.post("/memory", json={"messages": [{"role": "user", "content": "hate"}]})
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["scanner"] == "content"
    assert detail["categories"] == ["S10"]
    assert detail["category_names"] == ["Hate"]


def test_memory_write_guard_config_is_503(monkeypatch, make_app):
    from app.application.errors import GuardConfigError

    async def boom(_messages, _flags):
        raise GuardConfigError("GUARD_CONTENT_IGNORE contains unknown category 'S99'. Use S1–S14.")

    monkeypatch.setenv("MEMORY", "1")
    app = make_app()
    monkeypatch.setattr(app.state.runtime.guards, "assert_memory_write", boom)
    client = TestClient(app)
    response = client.post("/memory", json={"messages": [{"role": "user", "content": "x"}]})
    assert response.status_code == 503


def test_chat_guard_blocked_is_400(make_app, monkeypatch):
    from app.application.errors import GuardBlockedError

    async def blocked(*_a, **_k):
        raise GuardBlockedError("injection", "Prompt injection blocked.")

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "complete", blocked)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["scanner"] == "injection"
    assert detail["categories"] == []
    assert detail["category_names"] == []
    assert "Prompt injection blocked" in detail["error"]


def test_chat_guard_config_is_503(make_app, monkeypatch):
    from app.application.errors import GuardConfigError

    async def boom(*_a, **_k):
        raise GuardConfigError("Guard injection model is not in the catalog.")

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "complete", boom)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 503


def test_sse_includes_guard_passed(make_app, monkeypatch):
    async def fake_stream(*_a, **_k):
        model = "groq/openai/gpt-oss-20b"
        yield StreamStarted(model, "groq", None, None, None, None, True)
        yield StreamDelta("hi")
        yield StreamUsage(UsageInfo(total_tokens=5, cost_usd=None), None)
        yield StreamFinished(model=model, served=model)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        },
    )
    assert '"guard_passed": true' in response.text


def test_sse_guard_blocked(make_app, monkeypatch):
    from app.application.errors import GuardBlockedError

    async def fake_stream(*_a, **_k):
        raise GuardBlockedError("content", "Unsafe content blocked (S2).", ["S2"], ["Non-Violent Crimes"])
        yield StreamStarted("x", "unknown", None, None, None, None, None)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "x", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    )
    assert "Unsafe content blocked" in response.text
    assert "content" in response.text
    assert "S2" in response.text
    assert "Non-Violent Crimes" in response.text


def test_sse_guard_config_error(make_app, monkeypatch):
    from app.application.errors import GuardConfigError

    async def fake_stream(*_a, **_k):
        raise GuardConfigError("GUARD=1 requires GUARD_INJECTION or GUARD_CONTENT to be on.")
        yield StreamStarted("x", "unknown", None, None, None, None, None)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "x", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    )
    assert "GUARD=1 requires" in response.text


def test_chat_stream_and_schema_is_400_json(client):
    response = client.post(
        "/chat",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
            "response_format": {"type": "json_object"},
        },
    )
    assert response.status_code == 400
    assert "application/json" in response.headers["content-type"]
    assert "stream" in response.json()["detail"]["error"].lower()


def test_chat_invalid_response_format_is_400(client):
    response = client.post(
        "/chat",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "response_format": {"type": "xml"},
        },
    )
    assert response.status_code == 400
    assert "json_object" in response.json()["detail"]["error"]


def test_chat_schema_mismatch_is_400(make_app, monkeypatch):
    from app.structured import SchemaError

    async def mismatch(*_a, **_k):
        raise SchemaError("Assistant output does not match the schema.", path="secret")

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "complete", mismatch)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hi"}],
            "response_format": {"type": "json_object"},
        },
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["error"] == "Assistant output does not match the schema."
    assert detail["path"] == "secret"
    assert "leak" not in response.text


def test_sse_schema_error(make_app, monkeypatch):
    from app.structured import SchemaError

    async def fake_stream(*_a, **_k):
        raise SchemaError("Assistant output is not valid JSON.")
        yield StreamStarted("x", "unknown", None, None, None, None, None)

    app = make_app()
    monkeypatch.setattr(app.state.runtime.chat, "stream", fake_stream)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "x", "messages": [{"role": "user", "content": "hi"}], "stream": True},
    )
    assert "not valid JSON" in response.text
    assert '{"password"' not in response.text


def test_index_points_at_console(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "http://localhost:3000" in response.text
    assert "/docs" in response.text
    assert "Ask the selected model" not in response.text
    assert "POST /chat" in response.text


def test_cors_origins_parse(monkeypatch):
    from app.api.app import cors_origins

    monkeypatch.setenv("CORS_ORIGINS", " http://a:1 ,http://b:2 ")
    assert cors_origins() == ["http://a:1", "http://b:2"]
    monkeypatch.delenv("CORS_ORIGINS")
    assert "http://localhost:3000" in cors_origins()
    assert "http://127.0.0.1:3000" in cors_origins()


def test_cors_allows_console_origin(client):
    response = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_allows_127_origin(client):
    response = client.get("/health", headers={"Origin": "http://127.0.0.1:3000"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:3000"


def test_cors_omits_unknown_origin(client):
    response = client.get("/health", headers={"Origin": "http://evil.example"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") != "http://evil.example"


def test_cors_preflight_console(client):
    response = client.options(
        "/chat",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
