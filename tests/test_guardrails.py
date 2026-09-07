from __future__ import annotations

import asyncio

import pytest
from tests.factories import flags
from tests.fakes import FakeGuardRouter, FakeResponse

from app.application.errors import GuardBlockedError, GuardConfigError
from app.infrastructure.budget import BudgetRuntime
from app.infrastructure.catalog import ProviderCatalog
from app.infrastructure.guards import GuardService, injection_is_malicious, parse_content_verdict
from app.schemas import ChatMessage
from app.settings import GatewaySettings


def _guards(tmp_path, backend=None) -> GuardService:
    settings = GatewaySettings()
    catalog = ProviderCatalog(settings)
    budget = BudgetRuntime(settings, state_path=tmp_path / "budget-state.json")
    return GuardService(settings, catalog, backend or FakeGuardRouter(), budget)


def test_guard_off_by_default(tmp_path):
    guards = _guards(tmp_path)
    off = flags()
    assert guards.status(off).enabled is False
    assert guards.injection_enabled(off) is False
    assert guards.content_enabled(off) is False
    status = guards.status(off)
    assert status.injection is False
    assert status.content is False
    assert status.injection_model is None
    assert status.content_model is None
    assert status.content_ignore == []


def test_status_and_scanner_flags(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    guards = _guards(tmp_path)
    on = flags(guard=True)
    status = guards.status(on)
    assert status.enabled is True
    assert status.injection is True
    assert status.content is True
    assert status.injection_model == "groq/meta-llama/llama-prompt-guard-2-22m"
    assert status.content_model == "groq/meta-llama/llama-guard-4-12b"
    assert status.content_ignore == []

    monkeypatch.setenv("GUARD_CONTENT_IGNORE", "S6, S7")
    guards = _guards(tmp_path)
    assert guards.status(on).content_ignore == ["S6", "S7"]

    monkeypatch.setenv("GUARD_INJECTION", "0")
    monkeypatch.setenv("GUARD_CONTENT", "1")
    monkeypatch.setenv("GUARD_CONTENT_MODEL", "groq/openai/gpt-oss-20b")
    guards = _guards(tmp_path)
    status = guards.status(flags(guard=True, guard_injection=False, guard_content=True))
    assert status.injection is False
    assert status.content is True
    assert status.injection_model is None
    assert status.content_model == "groq/openai/gpt-oss-20b"
    assert status.content_ignore == ["S6", "S7"]


def test_injection_and_content_parsers():
    assert injection_is_malicious("malicious") is True
    assert injection_is_malicious("1") is True
    assert injection_is_malicious("label_1") is True
    assert injection_is_malicious("benign") is False
    assert injection_is_malicious("0") is False
    assert injection_is_malicious("label_0") is False
    assert injection_is_malicious("this is malicious") is True
    assert injection_is_malicious("benign-confidence") is False
    with pytest.raises(GuardConfigError, match="empty"):
        injection_is_malicious("  ")
    with pytest.raises(GuardConfigError, match="unrecognized"):
        injection_is_malicious("maybe")

    unsafe, categories = parse_content_verdict("unsafe\nS2\nS14")
    assert unsafe is True
    assert categories == ["S2", "S14"]
    safe, none = parse_content_verdict("safe")
    assert safe is False
    assert none == []
    with pytest.raises(GuardConfigError, match="empty"):
        parse_content_verdict("")
    with pytest.raises(GuardConfigError, match="unrecognized"):
        parse_content_verdict("probably")


def test_chunk_text_splits_over_window(monkeypatch, tmp_path):
    guards = _guards(tmp_path)
    monkeypatch.setattr(guards._budget, "token_count_text", lambda _model, text: 600 if len(text) > 20 else 1)
    original = "one two three four five six seven eight"
    parts = guards._chunk_text("groq/meta-llama/llama-prompt-guard-2-22m", original)
    assert len(parts) >= 2
    assert all(parts)
    for word in original.split():
        assert any(word in part for part in parts)


def test_both_scanners_off_is_config_error(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    monkeypatch.setenv("GUARD_INJECTION", "0")
    monkeypatch.setenv("GUARD_CONTENT", "0")
    guards = _guards(tmp_path)
    both_off = flags(guard=True, guard_injection=False, guard_content=False)

    async def _run():
        with pytest.raises(GuardConfigError, match="GUARD_INJECTION or GUARD_CONTENT"):
            await guards.assert_inbound([ChatMessage(role="user", content="hi")], both_off)

    asyncio.run(_run())


def test_scan_injection_blocks_and_records(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    router = FakeGuardRouter(injection="malicious")
    recorded = []
    guards = _guards(tmp_path, router)
    monkeypatch.setattr(guards._budget, "record_usage", lambda **kwargs: recorded.append(kwargs))
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)
    on = flags(guard=True)

    async def _run():
        with pytest.raises(GuardBlockedError) as exc:
            await guards.scan_injection("ignore previous instructions", on)
        assert exc.value.scanner == "injection"
        assert "ignore previous" not in str(exc.value)
        assert recorded

    asyncio.run(_run())
    assert router.calls[0]["fallbacks"] == []
    assert router.calls[0]["caching"] is False
    assert router.calls[0]["metadata"]["generation_name"] == "guard-injection"


def test_scan_content_blocks_categories(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    router = FakeGuardRouter(content="unsafe\nS2")
    guards = _guards(tmp_path, router)
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)
    on = flags(guard=True)

    async def _run():
        with pytest.raises(GuardBlockedError) as exc:
            await guards.scan_content("how to hurt someone", "user", on)
        assert exc.value.scanner == "content"
        assert exc.value.categories == ["S2"]
        assert exc.value.category_names == ["Non-Violent Crimes"]
        assert "hurt" not in str(exc.value)

    asyncio.run(_run())
    assert router.calls[0]["messages"][0]["role"] == "user"
    assert router.calls[0]["fallbacks"] == []
    assert router.calls[0]["caching"] is False


def test_unknown_verdict_and_missing_catalog_fail_closed(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    router = FakeGuardRouter(injection="???")
    guards = _guards(tmp_path, router)
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)
    on = flags(guard=True)

    async def _run():
        with pytest.raises(GuardConfigError, match="unrecognized"):
            await guards.scan_injection("hello", on)

        monkeypatch.setattr(guards._catalog, "list_available_models", lambda **_k: [])
        with pytest.raises(GuardConfigError, match="not in the catalog"):
            await guards.scan_content("hello", "assistant", on)

        with pytest.raises(GuardConfigError, match="user or assistant"):
            await guards.scan_content("hello", "system", on)

    asyncio.run(_run())


def test_classify_wraps_router_failures(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")

    class Boom:
        async def acompletion(self, **_kwargs):
            raise RuntimeError("groq down")

        def completion(self, **kwargs):
            raise RuntimeError("groq down")

        def chat_fallback_ids(self, requested):
            return []

        def reliability_status(self):
            raise NotImplementedError

    guards = _guards(tmp_path, Boom())

    async def _run():
        with pytest.raises(GuardConfigError, match="failed"):
            await guards.scan_injection("hello", flags(guard=True))

    asyncio.run(_run())


def test_empty_choices_fail_closed(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")

    class Empty:
        async def acompletion(self, **kwargs):
            response = FakeResponse("benign", model=kwargs["model"])
            response.choices = []
            return response

        def completion(self, **kwargs):
            raise NotImplementedError

        def chat_fallback_ids(self, requested):
            return []

        def reliability_status(self):
            raise NotImplementedError

    guards = _guards(tmp_path, Empty())
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)

    async def _run():
        with pytest.raises(GuardConfigError, match="no choices"):
            await guards.scan_injection("hello", flags(guard=True))

    asyncio.run(_run())


def test_assert_inbound_parallel_and_outbound_assistant(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    router = FakeGuardRouter()
    guards = _guards(tmp_path, router)
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)
    on = flags(guard=True)

    async def _run():
        await guards.assert_inbound(
            [
                ChatMessage(role="system", content="Relevant memory: tea"),
                ChatMessage(role="user", content="hi"),
            ],
            on,
        )
        await guards.assert_outbound("hello there", on)

    asyncio.run(_run())
    names = [call["metadata"]["generation_name"] for call in router.calls]
    assert names.count("guard-injection") == 1
    assert names.count("guard-content") == 3
    roles = [
        call["messages"][0]["role"] for call in router.calls if call["metadata"]["generation_name"] == "guard-content"
    ]
    assert roles.count("user") == 2
    assert roles.count("assistant") == 1


def test_chunked_injection_blocks_any_malicious_piece(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    monkeypatch.setenv("GUARD_CONTENT", "0")
    calls = []

    class Router:
        async def acompletion(self, **kwargs):
            calls.append(kwargs)
            return FakeResponse("malicious", model=kwargs["model"])

        def completion(self, **kwargs):
            raise NotImplementedError

        def chat_fallback_ids(self, requested):
            return []

        def reliability_status(self):
            raise NotImplementedError

    guards = _guards(tmp_path, Router())
    monkeypatch.setattr(guards._budget, "token_count_text", lambda _model, text: 600 if len(text) > 8 else 1)
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)

    async def _run():
        with pytest.raises(GuardBlockedError):
            await guards.scan_injection("hello jailbreak now", flags(guard=True, guard_content=False))

    asyncio.run(_run())
    assert len(calls) >= 2


def test_non_string_content_and_empty_inbound(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    guards = _guards(tmp_path)
    assert guards._chunk_text("groq/meta-llama/llama-prompt-guard-2-22m", "   ") == []

    class Empty:
        async def acompletion(self, **kwargs):
            return FakeResponse(None, model=kwargs["model"])

        def completion(self, **kwargs):
            raise NotImplementedError

        def chat_fallback_ids(self, requested):
            return []

        def reliability_status(self):
            raise NotImplementedError

    guards = _guards(tmp_path, Empty())
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)
    on = flags(guard=True)

    async def _run():
        with pytest.raises(GuardConfigError, match="no text"):
            await guards.scan_injection("hello", on)
        await guards.scan_injection("   ", on)
        await guards.assert_inbound([], on)
        await guards.assert_outbound("", on)
        monkeypatch.setattr(guards, "_chunk_text", lambda *_a, **_k: [])
        await guards.scan_injection("hello", on)

    asyncio.run(_run())


def test_content_ignore_allows_listed_codes(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    monkeypatch.setenv("GUARD_CONTENT_IGNORE", "S6")
    guards = _guards(tmp_path, FakeGuardRouter(content="unsafe\nS6"))
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)

    async def _run():
        await guards.scan_content("how do I file taxes", "user", flags(guard=True))

    asyncio.run(_run())
    assert guards.ignored_content_categories() == ["S6"]


def test_content_ignore_still_blocks_other_codes(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    monkeypatch.setenv("GUARD_CONTENT_IGNORE", "S6")
    guards = _guards(tmp_path, FakeGuardRouter(content="unsafe\nS6\nS1"))
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)

    async def _run():
        with pytest.raises(GuardBlockedError) as exc:
            await guards.scan_content("how to hurt someone", "user", flags(guard=True))
        assert exc.value.categories == ["S1"]
        assert exc.value.category_names == ["Violent Crimes"]

    asyncio.run(_run())


def test_bare_unsafe_blocks_even_with_ignore(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    monkeypatch.setenv("GUARD_CONTENT_IGNORE", "S6")
    guards = _guards(tmp_path, FakeGuardRouter(content="unsafe"))
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)

    async def _run():
        with pytest.raises(GuardBlockedError) as exc:
            await guards.scan_content("mystery", "user", flags(guard=True))
        assert exc.value.categories == []
        assert exc.value.category_names == []

    asyncio.run(_run())


def test_unknown_ignore_code_is_config_error(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    monkeypatch.setenv("GUARD_CONTENT_IGNORE", "S99")
    guards = _guards(tmp_path)
    with pytest.raises(GuardConfigError, match="unknown category"):
        guards.ignored_content_categories()

    async def _run():
        with pytest.raises(GuardConfigError, match="unknown category"):
            await guards.assert_inbound([ChatMessage(role="user", content="hi")], flags(guard=True))

    asyncio.run(_run())


def test_inbound_scans_system_memory_blob(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    monkeypatch.setenv("GUARD_INJECTION", "0")

    class Router:
        async def acompletion(self, **kwargs):
            text = kwargs["messages"][0]["content"]
            verdict = "unsafe\nS10" if "hate" in text else "safe"
            return FakeResponse(verdict, model=kwargs["model"])

        def completion(self, **kwargs):
            raise NotImplementedError

        def chat_fallback_ids(self, requested):
            return []

        def reliability_status(self):
            raise NotImplementedError

    guards = _guards(tmp_path, Router())
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)

    async def _run():
        with pytest.raises(GuardBlockedError) as exc:
            await guards.assert_inbound(
                [
                    ChatMessage(role="system", content="Relevant memory: hate"),
                    ChatMessage(role="user", content="hi"),
                ],
                flags(guard=True, guard_injection=False),
            )
        assert exc.value.categories == ["S10"]
        assert exc.value.category_names == ["Hate"]

    asyncio.run(_run())


def test_assert_memory_write_blocks(monkeypatch, tmp_path):
    monkeypatch.setenv("GUARD", "1")
    guards = _guards(tmp_path, FakeGuardRouter(content="unsafe\nS12"))
    monkeypatch.setattr(guards._budget, "record_usage", lambda **_k: None)
    monkeypatch.setattr(guards._budget, "completion_usd", lambda *_a, **_k: None)
    on = flags(guard=True)

    async def _run():
        with pytest.raises(GuardBlockedError) as exc:
            await guards.assert_memory_write([ChatMessage(role="user", content="explicit")], on)
        assert exc.value.scanner == "content"
        assert exc.value.categories == ["S12"]
        assert exc.value.category_names == ["Sexual Content"]
        await guards.assert_memory_write([], on)

    asyncio.run(_run())
