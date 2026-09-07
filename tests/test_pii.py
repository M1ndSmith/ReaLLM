from __future__ import annotations

import asyncio
import sys
from types import SimpleNamespace

import pytest

from app.application.errors import PiiConfigError
from app.infrastructure.pii import PiiRuntime, unique_entity_types
from app.schemas import ChatMessage, MemoryHit
from app.settings import GatewaySettings


class FakeAnalyzer:
    def __init__(self, needles: dict[str, str] | None = None):
        self.needles = needles or {"user@example.com": "EMAIL_ADDRESS"}

    def analyze(self, text, language="en", entities=None):
        results = []
        for needle, entity_type in self.needles.items():
            start = 0
            while True:
                idx = text.find(needle, start)
                if idx < 0:
                    break
                results.append(SimpleNamespace(entity_type=entity_type, start=idx, end=idx + len(needle), score=1.0))
                start = idx + len(needle)
        return results


class FakeAnonymizer:
    def anonymize(self, text, analyzer_results):
        out = text
        for item in sorted(analyzer_results, key=lambda row: row.start, reverse=True):
            out = out[: item.start] + f"<{item.entity_type}>" + out[item.end :]
        return SimpleNamespace(text=out)


def _pii() -> PiiRuntime:
    return PiiRuntime(GatewaySettings())


def _install_engines(monkeypatch, needles: dict[str, str] | None = None):
    monkeypatch.setenv("PII", "1")
    engines = (FakeAnalyzer(needles), FakeAnonymizer())
    pii = PiiRuntime(GatewaySettings())
    monkeypatch.setattr(pii, "get_engines", lambda: engines)
    return pii


def test_pii_off_by_default():
    status = _pii().status(False)
    assert status.enabled is False
    assert status.engine is None
    assert status.entities == []


def test_status_and_entities(monkeypatch):
    monkeypatch.setenv("PII", "1")
    pii = _pii()
    status = pii.status(True)
    assert status.enabled is True
    assert status.engine == "presidio"
    assert "EMAIL_ADDRESS" in status.entities
    assert "PERSON" not in status.entities
    monkeypatch.setenv("PII_ENTITIES", "PERSON, EMAIL_ADDRESS")
    pii = _pii()
    assert pii.configured_entities() == ["PERSON", "EMAIL_ADDRESS"]
    monkeypatch.setenv("PII_ENTITIES", "  ,  ")
    pii = _pii()
    assert "EMAIL_ADDRESS" in pii.configured_entities()
    assert unique_entity_types(["EMAIL_ADDRESS"], ["EMAIL_ADDRESS", "US_SSN"]) == ["EMAIL_ADDRESS", "US_SSN"]
    assert pii.spacy_model_name() == "en_core_web_sm"
    monkeypatch.setenv("PII_SPACY_MODEL", "en_core_web_lg")
    assert _pii().spacy_model_name() == "en_core_web_lg"


def test_redact_passthrough_when_off_skips_call():
    async def _run():
        pii = _pii()
        monkeypatch_engines_not_needed = True
        assert monkeypatch_engines_not_needed
        text, types = await pii.redact_text("")
        assert text == ""
        assert types == []

    asyncio.run(_run())


def test_redact_with_fake_engines(monkeypatch):
    pii = _install_engines(monkeypatch)

    async def _run():
        text, types = await pii.redact_text("mail me at user@example.com please")
        assert "<EMAIL_ADDRESS>" in text
        assert "user@example.com" not in text
        assert types == ["EMAIL_ADDRESS"]
        empty, none = await pii.redact_text("")
        assert empty == ""
        assert none == []
        messages, found = await pii.redact_messages(
            [ChatMessage(role="user", content="user@example.com"), ChatMessage(role="assistant", content="ok")]
        )
        assert messages[0].content == "<EMAIL_ADDRESS>"
        assert "EMAIL_ADDRESS" in found
        hits = await pii.redact_hits([MemoryHit(id="1", memory="user@example.com", score=1)])
        assert hits[0].memory == "<EMAIL_ADDRESS>"
        rows = await pii.redact_result_rows([{"memory": "user@example.com"}, {"ok": True}, "skip"])
        assert rows[0]["memory"] == "<EMAIL_ADDRESS>"
        assert rows[1] == {"ok": True}
        assert rows[2] == "skip"

    asyncio.run(_run())


def test_redact_fails_closed(monkeypatch):
    monkeypatch.setenv("PII", "1")
    pii = _pii()

    class Boom:
        def analyze(self, **_k):
            raise RuntimeError("analyzer down")

    monkeypatch.setattr(pii, "get_engines", lambda: (Boom(), FakeAnonymizer()))

    async def _run():
        with pytest.raises(PiiConfigError, match="PII redaction failed"):
            await pii.redact_text("user@example.com")

    asyncio.run(_run())


def test_get_engines_singleton(monkeypatch):
    monkeypatch.setenv("PII", "1")
    pii = _pii()
    marker = (FakeAnalyzer(), FakeAnonymizer())
    monkeypatch.setattr(pii, "_build_engines", lambda: marker)
    assert pii.get_engines() is marker
    assert pii.get_engines() is marker


def test_build_engines_import_error(monkeypatch):
    monkeypatch.setenv("PII", "1")
    pii = _pii()
    monkeypatch.setattr(pii, "_ensure_spacy_model", lambda _n: None)
    real_import = __import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name.startswith("presidio"):
            raise ImportError("missing")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr("builtins.__import__", fake_import)
    with pytest.raises(PiiConfigError, match="Presidio is not installed"):
        pii._build_engines()


def test_build_engines_provider_error(monkeypatch):
    monkeypatch.setenv("PII", "1")
    pii = _pii()
    monkeypatch.setattr(pii, "_ensure_spacy_model", lambda _n: None)

    class Provider:
        def __init__(self, nlp_configuration):
            raise RuntimeError("bad nlp")

    presidio_analyzer = SimpleNamespace(
        AnalyzerEngine=object,
        nlp_engine=SimpleNamespace(NlpEngineProvider=Provider),
    )
    monkeypatch.setitem(sys.modules, "presidio_analyzer", presidio_analyzer)
    monkeypatch.setitem(sys.modules, "presidio_analyzer.nlp_engine", presidio_analyzer.nlp_engine)
    monkeypatch.setitem(sys.modules, "presidio_anonymizer", SimpleNamespace(AnonymizerEngine=object))
    with pytest.raises(PiiConfigError, match="Presidio failed to load"):
        pii._build_engines()


def test_build_engines_success(monkeypatch):
    monkeypatch.setenv("PII", "1")
    pii = _pii()
    monkeypatch.setattr(pii, "_ensure_spacy_model", lambda _n: None)

    class Provider:
        def __init__(self, nlp_configuration):
            self.cfg = nlp_configuration

        def create_engine(self):
            return "nlp"

    class Analyzer:
        def __init__(self, nlp_engine, supported_languages):
            self.nlp_engine = nlp_engine

    class Anonymizer:
        pass

    monkeypatch.setitem(
        sys.modules,
        "presidio_analyzer",
        SimpleNamespace(AnalyzerEngine=Analyzer, nlp_engine=SimpleNamespace(NlpEngineProvider=Provider)),
    )
    monkeypatch.setitem(sys.modules, "presidio_analyzer.nlp_engine", SimpleNamespace(NlpEngineProvider=Provider))
    monkeypatch.setitem(sys.modules, "presidio_anonymizer", SimpleNamespace(AnonymizerEngine=Anonymizer))
    analyzer, anonymizer = pii._build_engines()
    assert isinstance(analyzer, Analyzer)
    assert isinstance(anonymizer, Anonymizer)


def test_ensure_spacy_packaged(monkeypatch):
    class Util:
        @staticmethod
        def is_package(name):
            return True

    fake = SimpleNamespace(util=Util, load=lambda _n: (_ for _ in ()).throw(AssertionError("load")))
    monkeypatch.setitem(sys.modules, "spacy", fake)
    _pii()._ensure_spacy_model("en_core_web_sm")


def test_redact_string_anonymizer_result(monkeypatch):
    monkeypatch.setenv("PII", "1")
    pii = _pii()

    class Analyzer:
        def analyze(self, **_k):
            return [SimpleNamespace(entity_type="EMAIL_ADDRESS")]

    class Anonymizer:
        def anonymize(self, text, analyzer_results):
            return "<EMAIL_ADDRESS>"

    monkeypatch.setattr(pii, "get_engines", lambda: (Analyzer(), Anonymizer()))

    async def _run():
        text, types = await pii.redact_text("user@example.com")
        assert text == "<EMAIL_ADDRESS>"
        assert types == ["EMAIL_ADDRESS"]

    asyncio.run(_run())


def test_ensure_spacy_load_existing(monkeypatch):
    class Util:
        @staticmethod
        def is_package(name):
            return False

    loaded = []

    fake = SimpleNamespace(util=Util, load=lambda name: loaded.append(name))
    monkeypatch.setitem(sys.modules, "spacy", fake)
    _pii()._ensure_spacy_model("en_core_web_sm")
    assert loaded == ["en_core_web_sm"]


def test_ensure_spacy_download(monkeypatch):
    class Util:
        @staticmethod
        def is_package(name):
            return False

    calls = {"load": 0}

    def load(_name):
        calls["load"] += 1
        if calls["load"] == 1:
            raise OSError("missing")
        return object()

    fake = SimpleNamespace(util=Util, load=load, cli=SimpleNamespace(download=lambda _n: None))
    monkeypatch.setitem(sys.modules, "spacy", fake)
    monkeypatch.setitem(sys.modules, "spacy.cli", fake.cli)
    _pii()._ensure_spacy_model("en_core_web_sm")
    assert calls["load"] == 2


def test_ensure_spacy_missing_install(monkeypatch):
    real_import = __import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "spacy":
            raise ImportError("no spacy")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr("builtins.__import__", fake_import)
    with pytest.raises(PiiConfigError, match="spaCy is not installed"):
        _pii()._ensure_spacy_model("en_core_web_sm")


def test_ensure_spacy_download_fails(monkeypatch):
    class Util:
        @staticmethod
        def is_package(name):
            return False

    def load(_name):
        raise OSError("missing")

    fake = SimpleNamespace(
        util=Util,
        load=load,
        cli=SimpleNamespace(download=lambda _n: (_ for _ in ()).throw(RuntimeError("net"))),
    )
    monkeypatch.setitem(sys.modules, "spacy", fake)
    monkeypatch.setitem(sys.modules, "spacy.cli", fake.cli)
    with pytest.raises(PiiConfigError, match="could not be loaded"):
        _pii()._ensure_spacy_model("en_core_web_sm")
