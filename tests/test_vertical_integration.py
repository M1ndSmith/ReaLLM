from __future__ import annotations

from fastapi.testclient import TestClient
from tests.factories import app_for
from tests.fakes import FakeChunk, FakeResponse, FakeUsage


def test_native_route_uses_real_chat_service(monkeypatch, tmp_path):
    app = app_for(tmp_path)
    seen: dict = {}

    async def fake_completion(**kwargs):
        seen.update(kwargs)
        return FakeResponse("vertical-ok", model=kwargs["model"])

    monkeypatch.setattr(app.state.runtime.router, "acompletion", fake_completion)
    monkeypatch.setattr(app.state.runtime.budget, "completion_usd", lambda *_a, **_k: None)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hello"}]},
    )
    assert response.status_code == 200
    assert response.json()["message"]["content"] == "vertical-ok"
    assert seen["model"] == "groq/openai/gpt-oss-20b"
    assert "messages" in seen


def test_openai_route_streams_via_real_chat_service(monkeypatch, tmp_path):
    app = app_for(tmp_path)

    async def fake_completion(**kwargs):
        if kwargs.get("stream"):

            async def _gen():
                yield FakeChunk("part-a", model=kwargs["model"])
                yield FakeChunk("part-b", usage=FakeUsage())

            return _gen()
        return FakeResponse("x", model=kwargs["model"])

    monkeypatch.setattr(app.state.runtime.router, "acompletion", fake_completion)
    monkeypatch.setattr(app.state.runtime.budget, "completion_usd", lambda *_a, **_k: None)
    client = TestClient(app)
    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
        },
    )
    assert response.status_code == 200
    assert "part-a" in response.text
    assert "part-b" in response.text


def test_openai_temperature_reaches_backend(monkeypatch, tmp_path):
    app = app_for(tmp_path)
    seen: dict = {}

    async def fake_completion(**kwargs):
        seen.update(kwargs)
        return FakeResponse("ok", model=kwargs["model"])

    monkeypatch.setattr(app.state.runtime.router, "acompletion", fake_completion)
    monkeypatch.setattr(app.state.runtime.budget, "completion_usd", lambda *_a, **_k: None)
    client = TestClient(app)
    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "groq/openai/gpt-oss-20b",
            "messages": [{"role": "user", "content": "hello"}],
            "temperature": 0.1,
            "max_tokens": 16,
        },
    )
    assert response.status_code == 200
    assert seen["temperature"] == 0.1
    assert seen["max_tokens"] == 16
