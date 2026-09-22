from __future__ import annotations

import asyncio
from types import SimpleNamespace

from tests.factories import flags, runtime
from tests.fakes import FakeResponse

from app.infrastructure.memory import (
    RouterLLM,
    _latest_user_text,
    _parse_llm_response,
    inject_memories,
    resolve_scope,
)
from app.schemas import ChatMessage


def test_memory_off_by_default(tmp_path):
    rt = runtime(tmp_path)
    snap = rt.flags.snapshot()
    assert snap.memory is False
    status = rt.memory.status(snap)
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


def test_attach_memories_noop_when_off(tmp_path):
    async def _run():
        rt = runtime(tmp_path)
        messages = [ChatMessage(role="user", content="hi")]
        out, used = await rt.memory.attach(messages, rt.flags.snapshot())
        assert used is None
        assert out == messages

    asyncio.run(_run())


def test_attach_and_search_with_stub(monkeypatch, tmp_path):
    async def _run():
        monkeypatch.setenv("MEMORY", "1")
        rt = runtime(tmp_path)

        class Mem:
            def search(self, query, top_k, filters):
                assert query == "hi"
                assert filters["user_id"] == "ada"
                return {"results": [{"id": "1", "memory": "likes tea", "score": 0.9}]}

        monkeypatch.setattr(rt.memory, "get_memory", lambda flags=None: Mem())
        on = flags(memory=True)
        out, n = await rt.memory.attach(
            [ChatMessage(role="user", content="hi")],
            on,
            user_id="ada",
        )
        assert n == 1
        assert out[0].role == "system"
        assert "likes tea" in out[0].content
        hits = await rt.memory.search("hi", user_id="ada")
        assert hits[0].memory == "likes tea"
        assert rt.memory._hit_models({"results": [{"memory": "x", "id": 2, "score": 1}]})[0].id == "2"

    asyncio.run(_run())


def test_router_llm_metadata(monkeypatch, tmp_path):
    captured: dict = {}

    class Backend:
        def completion(self, **kwargs):
            captured.update(kwargs)
            return FakeResponse("extracted")

        def chat_fallback_ids(self, model):
            return ["groq/openai/gpt-oss-120b"]

        async def acompletion(self, **kwargs):
            return FakeResponse("extracted")

        def reliability_status(self):
            raise NotImplementedError

    rt = runtime(tmp_path)
    monkeypatch.setattr(rt.budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(rt.budget, "completion_usd", lambda *_a, **_k: None)
    text = RouterLLM("groq/openai/gpt-oss-20b", Backend(), rt.budget).generate_response(
        [{"role": "user", "content": "x"}]
    )
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


def test_memory_status_and_get_memory(monkeypatch, tmp_path):

    monkeypatch.setenv("MEMORY", "1")
    rt = runtime(tmp_path)
    status = rt.memory.status(flags(memory=True))
    assert status.enabled is True
    assert status.embedder == "fastembed"
    monkeypatch.setenv("MEMORY_EMBEDDER", "nope")
    from pydantic import ValidationError

    try:
        from app.settings import GatewaySettings

        GatewaySettings()
        raise AssertionError("expected ValidationError")
    except ValidationError:
        pass
    monkeypatch.setenv("MEMORY_EMBEDDER", "fastembed")
    monkeypatch.setenv("MEMORY_LLM_MODEL", "groq/openai/gpt-oss-20b")
    rt = runtime(tmp_path)
    assert rt.memory._llm_model_id() == "groq/openai/gpt-oss-20b"

    monkeypatch.setattr(rt.memory, "_build_memory", lambda: "mem-obj")
    assert rt.memory.get_memory(flags(memory=True)) == "mem-obj"
    assert rt.memory.get_memory(flags(memory=True)) == "mem-obj"

    added = []
    monkeypatch.setattr(rt.memory, "_add_sync", lambda *a, **k: added.append((a, k)))
    rt.memory.schedule_record([ChatMessage(role="user", content="hi")], "reply", flags(memory=True))
    assert added


def test_build_memory_and_crud(monkeypatch, tmp_path):
    import mem0

    monkeypatch.setenv("MEMORY", "1")
    rt = runtime(tmp_path)
    monkeypatch.setattr(rt.memory, "_llm_model_id", lambda: "groq/openai/gpt-oss-20b")

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

        def get(self, memory_id):
            return {"id": memory_id, "user_id": "u", "memory": "ok"}

        def search(self, query, top_k, filters):
            return {"results": []}

    monkeypatch.setattr(mem0, "Memory", FakeMemory)
    built = rt.memory._build_memory()
    assert built.llm is not None
    monkeypatch.setattr(rt.memory, "get_memory", lambda flags=None: built)

    async def _run():
        payload = await rt.memory.add([ChatMessage(role="user", content="hi")], user_id="u")
        assert payload["results"][0]["memory"] == "ok"
        await rt.memory.delete("abc", user_id="u")
        assert built.deleted == "abc"

    asyncio.run(_run())


def test_memory_is_scoped_to_identity_and_delete_is_owned(monkeypatch, tmp_path):
    monkeypatch.setenv("MEMORY", "1")
    rt = runtime(tmp_path)
    rows: dict[str, dict] = {}

    class Store:
        def add(self, messages, **kwargs):
            memory_id = f"id-{kwargs['user_id']}"
            rows[memory_id] = {"id": memory_id, "memory": "fact", "user_id": kwargs["user_id"]}
            return {"results": [rows[memory_id]]}

        def search(self, query, top_k, filters):
            found = [row for row in rows.values() if row["user_id"] == filters["user_id"]]
            return {"results": found}

        def get(self, memory_id):
            if memory_id not in rows:
                raise ValueError("missing")
            return rows[memory_id]

        def delete(self, memory_id):
            del rows[memory_id]

    monkeypatch.setattr(rt.memory, "get_memory", lambda flags=None: Store())

    async def _run():
        await rt.memory.add([ChatMessage(role="user", content="hi")], user_id="key-a")
        own = await rt.memory.search("fact", user_id="key-a")
        other = await rt.memory.search("fact", user_id="key-b")
        blank = await rt.memory.search("fact", user_id=None)
        assert own and own[0].memory == "fact"
        assert other == []
        assert blank == []
        try:
            await rt.memory.delete("id-key-a", user_id="key-b")
            raise AssertionError("foreign delete should fail")
        except ValueError as exc:
            assert "not found" in str(exc)
        assert "id-key-a" in rows
        await rt.memory.delete("id-key-a", user_id="key-a")
        assert rows == {}

    asyncio.run(_run())
