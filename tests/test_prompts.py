from __future__ import annotations

import json

import pytest

from app.application.errors import UnknownPromptError
from app.infrastructure.prompts import PromptRepository
from app.schemas import ChatMessage
from app.settings import GatewaySettings

PROMPTS_ROOT = None


def _repo(tmp_path=None) -> PromptRepository:
    from pathlib import Path

    prompts_dir = tmp_path if tmp_path is not None else Path(__file__).resolve().parent.parent / "prompts"
    return PromptRepository(GatewaySettings(), prompts_dir=prompts_dir)


def test_local_prompt_and_variables(monkeypatch, tmp_path):
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
    repo = _repo(tmp_path)
    messages, meta = repo.resolve_prompt("greet", variables={"name": "Ada"})
    assert meta.source == "local"
    assert messages[0].content == "Hello Ada"
    outgoing, out_meta = repo.prepare_messages(
        [ChatMessage(role="user", content="hi")],
        prompt="greet",
        variables={"name": "Ada"},
    )
    assert out_meta is not None
    assert outgoing[0].content == "Hello Ada"
    assert outgoing[1].content == "hi"
    bare, none_meta = repo.prepare_messages([ChatMessage(role="user", content="x")])
    assert none_meta is None
    assert bare[0].content == "x"


def test_unknown_prompt():
    with pytest.raises(UnknownPromptError):
        _repo().resolve_prompt("does-not-exist")


def test_chat_assistant_file():
    repo = _repo()
    messages, meta = repo.resolve_prompt("chat-assistant")
    assert meta.name == "chat-assistant"
    assert messages[0].role == "system"
    names = [item.name for item in repo.list_prompts()]
    assert "chat-assistant" in names


def test_tracing_flags(monkeypatch, tmp_path):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "")
    repo = _repo(tmp_path)
    assert repo.prompts_enabled() is False
    assert repo.tracing_enabled() is False
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    repo = _repo(tmp_path)
    assert repo.prompts_source() == "langfuse"
    assert repo.tracing_enabled() is True
    monkeypatch.setenv("LANGFUSE_TRACING", "0")
    repo = _repo(tmp_path)
    assert repo.tracing_enabled() is False


def test_ensure_tracing(monkeypatch, tmp_path):
    import litellm

    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    monkeypatch.setenv("LANGFUSE_TRACING", "1")
    repo = _repo(tmp_path)
    repo.ensure_tracing()
    assert "langfuse_otel" in list(litellm.callbacks)
    repo.ensure_tracing()
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

    repo = _repo()
    monkeypatch.setattr(repo, "_get_langfuse_client", lambda: Client())
    messages, meta = repo.resolve_prompt("chat-assistant")
    assert meta.source == "langfuse"
    assert meta.version == 7
    assert messages[0].content == "from langfuse"

    class Boom:
        def get_prompt(self, *_a, **_k):
            raise RuntimeError("down")

    monkeypatch.setattr(repo, "_get_langfuse_client", lambda: Boom())
    messages, meta = repo.resolve_prompt("chat-assistant")
    assert meta.source == "local"
    assert "helpful assistant" in messages[0].content.lower()


def test_text_prompt_and_langfuse_list(monkeypatch, tmp_path):
    import app.infrastructure.prompts as prompts_mod

    (tmp_path / "plain.json").write_text(
        json.dumps({"name": "plain", "type": "text", "prompt": "Be {{tone}}"}),
        encoding="utf-8",
    )
    repo = _repo(tmp_path)
    messages, meta = repo.resolve_prompt("plain", variables={"tone": "brief"})
    assert meta.source == "local"
    assert messages[0].content == "Be brief"

    class Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"name": "remote-one"}, "remote-two"], "meta": {"totalPages": 1}}

    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    repo = _repo(tmp_path)
    monkeypatch.setattr(prompts_mod.httpx, "get", lambda *a, **k: Resp())
    names = [item.name for item in repo.list_prompts()]
    assert "remote-one" in names
    assert "remote-two" in names


def test_langfuse_list_uses_cache_on_hot_path(monkeypatch, tmp_path):
    import time

    import app.infrastructure.prompts as prompts_mod

    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    repo = _repo(tmp_path)
    repo._remote_names = ["cached-remote"]
    repo._remote_at = time.monotonic()

    def boom(*_a, **_k):
        raise AssertionError("Langfuse list should not hit the network on a warm cache")

    monkeypatch.setattr(prompts_mod.httpx, "get", boom)
    names = [item.name for item in repo.list_prompts()]
    assert "cached-remote" in names


def test_expired_langfuse_list_serves_stale_without_blocking(monkeypatch, tmp_path):
    import time

    import app.infrastructure.prompts as prompts_mod

    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    repo = _repo(tmp_path)
    repo._remote_names = ["stale-remote"]
    repo._remote_at = time.monotonic() - 120.0

    class Slow:
        def raise_for_status(self):
            time.sleep(0.2)
            return None

        def json(self):
            return {"data": [{"name": "fresh-remote"}], "meta": {"totalPages": 1}}

    monkeypatch.setattr(prompts_mod.httpx, "get", lambda *a, **k: Slow())
    started = time.monotonic()
    names = [item.name for item in repo.list_prompts()]
    elapsed = time.monotonic() - started
    assert "stale-remote" in names
    assert elapsed < 0.1
