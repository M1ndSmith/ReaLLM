from __future__ import annotations

import json

import pytest

from app.prompts import (
    UnknownPromptError,
    ensure_tracing,
    list_prompts,
    prepare_messages,
    prompts_enabled,
    prompts_source,
    resolve_prompt,
    tracing_enabled,
)
from app.schemas import ChatMessage
import app.prompts as prompts


def test_local_prompt_and_variables(monkeypatch, tmp_path):
    monkeypatch.setattr("app.prompts._PROMPTS_DIR", tmp_path)
    (tmp_path / "greet.json").write_text(
        json.dumps(
            {
                "name": "greet",
                "type": "chat",
                "prompt": [{"role": "system", "content": "Hello {{name}}"}],
            }
        ),
        encoding="utf-8",
    )
    messages, meta = resolve_prompt("greet", variables={"name": "Ada"})
    assert meta.source == "local"
    assert messages[0].content == "Hello Ada"
    outgoing, out_meta = prepare_messages(
        [ChatMessage(role="user", content="hi")],
        prompt="greet",
        variables={"name": "Ada"},
    )
    assert out_meta is not None
    assert outgoing[0].content == "Hello Ada"
    assert outgoing[1].content == "hi"
    bare, none_meta = prepare_messages([ChatMessage(role="user", content="x")])
    assert none_meta is None
    assert bare[0].content == "x"


def test_unknown_prompt():
    with pytest.raises(UnknownPromptError):
        resolve_prompt("does-not-exist")


def test_chat_assistant_file():
    messages, meta = resolve_prompt("chat-assistant")
    assert meta.name == "chat-assistant"
    assert messages[0].role == "system"
    names = [item.name for item in list_prompts()]
    assert "chat-assistant" in names


def test_tracing_flags(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "")
    assert prompts_enabled() is False
    assert tracing_enabled() is False
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    assert prompts_source() == "langfuse"
    assert tracing_enabled() is True
    monkeypatch.setenv("LANGFUSE_TRACING", "0")
    assert tracing_enabled() is False


def test_ensure_tracing(monkeypatch):
    import litellm

    import app.prompts as prompts

    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    monkeypatch.setenv("LANGFUSE_TRACING", "1")
    prompts._tracing_ready = False
    ensure_tracing()
    assert "langfuse_otel" in list(litellm.callbacks)
    ensure_tracing()
    assert list(litellm.callbacks).count("langfuse_otel") == 1


def test_langfuse_success_and_sdk_down(monkeypatch):
    class PromptObj:
        is_fallback = False
        version = 7

        def compile(self, **_variables):
            return [{"role": "system", "content": "from langfuse"}]

    class Client:
        def get_prompt(self, name, **_kwargs):
            assert name == "chat-assistant"
            return PromptObj()

    monkeypatch.setattr("app.prompts._get_langfuse_client", lambda: Client())
    messages, meta = resolve_prompt("chat-assistant")
    assert meta.source == "langfuse"
    assert meta.version == 7
    assert messages[0].content == "from langfuse"

    class Boom:
        def get_prompt(self, *_a, **_k):
            raise RuntimeError("down")

    monkeypatch.setattr("app.prompts._get_langfuse_client", lambda: Boom())
    messages, meta = resolve_prompt("chat-assistant")
    assert meta.source == "local"
    assert "helpful assistant" in messages[0].content.lower()


def test_text_prompt_and_langfuse_list(monkeypatch, tmp_path):

    monkeypatch.setattr(prompts, "_PROMPTS_DIR", tmp_path)
    (tmp_path / "plain.json").write_text(
        json.dumps({"name": "plain", "type": "text", "prompt": "Be {{tone}}"}),
        encoding="utf-8",
    )
    messages, meta = resolve_prompt("plain", variables={"tone": "brief"})
    assert meta.source == "local"
    assert messages[0].content == "Be brief"

    class Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"name": "remote-one"}, "remote-two"], "meta": {"totalPages": 1}}

    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    monkeypatch.setattr(prompts.httpx, "get", lambda *a, **k: Resp())
    names = [item.name for item in list_prompts()]
    assert "remote-one" in names
    assert "remote-two" in names
