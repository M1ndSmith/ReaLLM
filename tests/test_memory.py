from __future__ import annotations

import asyncio

from types import SimpleNamespace

from app.memory import (
    RouterLLM,
    _hit_models,
    _latest_user_text,
    _parse_llm_response,
    attach_memories,
    inject_memories,
    memory_enabled,
    memory_status,
    resolve_scope,
    search_memories,
)
from app.schemas import ChatMessage
from tests.fakes import FakeResponse


def test_memory_off_by_default():
    assert memory_enabled() is False
    status = memory_status()
    assert status.enabled is False


def test_scope_and_inject():
    scope = resolve_scope("ada", "conv-1", "agent-x")
    assert scope == {"user_id": "ada", "run_id": "conv-1", "agent_id": "agent-x"}
    assert resolve_scope(None, None, None)["user_id"] == "local"
    messages = [
        ChatMessage(role="system", content="sys"),
        ChatMessage(role="user", content="hello"),
    ]
    injected = inject_memories(messages, ["likes tea"])
    assert injected[0].role == "system"
    assert injected[1].role == "system"
    assert "likes tea" in injected[1].content
    assert inject_memories(messages, [])[0].content == "sys"
    assert _latest_user_text(messages) == "hello"
    assert _latest_user_text([{"role": "assistant", "content": "x"}]) == ""


def test_attach_memories_noop_when_off():
    async def _run():
        messages = [ChatMessage(role="user", content="hi")]
        out, used = await attach_memories(messages)
        assert used is None
        assert out == messages

    asyncio.run(_run())


def test_attach_and_search_with_stub(monkeypatch):
    async def _run():
        monkeypatch.setenv("MEMORY", "1")

        class Mem:
            def search(self, query, top_k, filters):
                assert query == "hi"
                assert filters["user_id"] == "ada"
                return {"results": [{"id": "1", "memory": "likes tea", "score": 0.9}]}

        monkeypatch.setattr("app.memory.get_memory", lambda: Mem())
        out, n = await attach_memories(
            [ChatMessage(role="user", content="hi")],
            user_id="ada",
        )
        assert n == 1
        assert out[0].role == "system"
        assert "likes tea" in out[0].content
        hits = await search_memories("hi", user_id="ada")
        assert hits[0].memory == "likes tea"
        assert _hit_models({"results": [{"memory": "x", "id": 2, "score": 1}]})[0].id == "2"

    asyncio.run(_run())


def test_router_llm_metadata(monkeypatch):
    captured: dict = {}

    class Router:
        def completion(self, **kwargs):
            captured.update(kwargs)
            return FakeResponse("extracted")

    monkeypatch.setattr("app.reliability.get_router", lambda: Router())
    monkeypatch.setattr("app.reliability.chat_fallback_ids", lambda *_a, **_k: ["groq/openai/gpt-oss-120b"])
    monkeypatch.setattr("app.budget.record_usage", lambda **_k: None)
    monkeypatch.setattr("app.budget.completion_usd", lambda *_a, **_k: None)
    text = RouterLLM("groq/openai/gpt-oss-20b").generate_response([{"role": "user", "content": "x"}])
    assert text == "extracted"
    assert captured["caching"] is False
    assert captured["metadata"]["generation_name"] == "mem0-extract"
    assert "mem0" in captured["metadata"]["tags"]
    assert captured["fallbacks"] == ["groq/openai/gpt-oss-120b"]

    fn = SimpleNamespace(name="lookup", arguments='{"q": "tea"}')
    tool = SimpleNamespace(function=fn)
    parsed = _parse_llm_response(FakeResponse("ignored", tool_calls=[tool]), tools=[{"type": "function"}])
    assert parsed["tool_calls"][0]["name"] == "lookup"
    assert parsed["tool_calls"][0]["arguments"] == {"q": "tea"}


def test_memory_status_and_get_memory(monkeypatch):
    from app.memory import MemoryConfigError, _embedder_provider, _llm_model_id, get_memory, record_turn

    monkeypatch.setenv("MEMORY", "1")
    status = memory_status()
    assert status.enabled is True
    assert status.embedder == "fastembed"
    monkeypatch.setenv("MEMORY_EMBEDDER", "nope")
    try:
        _embedder_provider()
        raise AssertionError("expected MemoryConfigError")
    except MemoryConfigError:
        pass
    monkeypatch.setenv("MEMORY_EMBEDDER", "fastembed")
    monkeypatch.setenv("MEMORY_LLM_MODEL", "groq/openai/gpt-oss-20b")
    assert _llm_model_id() == "groq/openai/gpt-oss-20b"

    monkeypatch.setattr("app.memory._build_memory", lambda: "mem-obj")
    assert get_memory() == "mem-obj"
    assert get_memory() == "mem-obj"

    added = []
    monkeypatch.setattr("app.memory._add_sync", lambda *a, **k: added.append((a, k)))
    record_turn([ChatMessage(role="user", content="hi")], "reply")
    assert added


def test_build_memory_and_crud(monkeypatch):
    import mem0

    from app.memory import _build_memory, add_memories, delete_memory

    monkeypatch.setenv("MEMORY", "1")
    monkeypatch.setattr("app.memory._llm_model_id", lambda: "groq/openai/gpt-oss-20b")

    class FakeMemory:
        def __init__(self):
            self.llm = None
            self.added = None

        @classmethod
        def from_config(cls, config):
            inst = cls()
            inst.config = config
            return inst

        def add(self, messages, **kwargs):
            return {"results": [{"memory": "ok"}]}

        def delete(self, memory_id):
            self.deleted = memory_id

        def search(self, query, top_k, filters):
            return {"results": []}

    monkeypatch.setattr(mem0, "Memory", FakeMemory)
    built = _build_memory()
    assert built.llm is not None
    monkeypatch.setattr("app.memory.get_memory", lambda: built)

    async def _run():
        payload = await add_memories([ChatMessage(role="user", content="hi")], user_id="u")
        assert payload["results"][0]["memory"] == "ok"
        await delete_memory("abc")

    asyncio.run(_run())

