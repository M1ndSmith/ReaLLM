from __future__ import annotations

import asyncio
import logging
import threading

from app.application.errors import PiiConfigError
from app.schemas import ChatMessage, MemoryHit, PiiInfo
from app.settings import GatewaySettings

logger = logging.getLogger(__name__)

_LANGUAGE = "en"


def unique_entity_types(*groups: list[str]) -> list[str]:
    seen: list[str] = []
    for group in groups:
        for item in group:
            if item and item not in seen:
                seen.append(item)
    return seen


class PiiRuntime:
    def __init__(self, settings: GatewaySettings):
        self._settings = settings
        self._lock = threading.Lock()
        self._engines: tuple[object, object] | None = None

    def configured_entities(self) -> list[str]:
        return self._settings.pii_entity_list()

    def spacy_model_name(self) -> str:
        return self._settings.spacy_model()

    def unique_entity_types(self, *groups: list[str]) -> list[str]:
        return unique_entity_types(*groups)

    def status(self, enabled: bool) -> PiiInfo:
        if not enabled:
            return PiiInfo(enabled=False)
        return PiiInfo(enabled=True, engine="presidio", entities=self.configured_entities())

    def _ensure_spacy_model(self, model_name: str) -> None:
        try:
            import spacy
        except ImportError as exc:
            raise PiiConfigError("PII is enabled but spaCy is not installed.") from exc
        util = getattr(spacy, "util", None)
        is_package = getattr(util, "is_package", None) if util is not None else None
        if callable(is_package) and is_package(model_name):
            return
        try:
            spacy.load(model_name)
            return
        except OSError:
            pass
        try:
            from spacy.cli import download

            download(model_name)
            spacy.load(model_name)
        except Exception as exc:
            raise PiiConfigError(
                f"PII is enabled but spaCy model '{model_name}' could not be loaded. "
                f"Install it with: python -m spacy download {model_name}"
            ) from exc

    def _build_engines(self) -> tuple[object, object]:
        model_name = self.spacy_model_name()
        self._ensure_spacy_model(model_name)
        try:
            from presidio_analyzer import AnalyzerEngine
            from presidio_analyzer.nlp_engine import NlpEngineProvider
            from presidio_anonymizer import AnonymizerEngine
        except ImportError as exc:
            raise PiiConfigError("PII is enabled but Presidio is not installed.") from exc
        configuration = {
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": _LANGUAGE, "model_name": model_name}],
        }
        try:
            provider = NlpEngineProvider(nlp_configuration=configuration)
            nlp_engine = provider.create_engine()
            analyzer = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=[_LANGUAGE])
            anonymizer = AnonymizerEngine()
        except Exception as exc:
            raise PiiConfigError(f"PII is enabled but Presidio failed to load: {exc}") from exc
        return analyzer, anonymizer

    def get_engines(self) -> tuple[object, object]:
        if self._engines is not None:
            return self._engines
        with self._lock:
            if self._engines is not None:
                return self._engines
            self._engines = self._build_engines()
            return self._engines

    def _redact_text_sync(self, text: str) -> tuple[str, list[str]]:
        analyzer, anonymizer = self.get_engines()
        entities = self.configured_entities()
        try:
            results = analyzer.analyze(text=text, language=_LANGUAGE, entities=entities)
            anonymized = anonymizer.anonymize(text=text, analyzer_results=results)
        except Exception as exc:
            raise PiiConfigError(f"PII redaction failed: {exc}") from exc
        types = unique_entity_types([str(getattr(item, "entity_type", "") or "") for item in (results or [])])
        redacted = getattr(anonymized, "text", None)
        if not isinstance(redacted, str):
            redacted = str(anonymized)
        return redacted, types

    async def redact_text(self, text: str) -> tuple[str, list[str]]:
        if not text:
            return text, []
        return await asyncio.to_thread(self._redact_text_sync, text)

    async def redact_messages(self, messages: list[ChatMessage]) -> tuple[list[ChatMessage], list[str]]:
        redacted: list[ChatMessage] = []
        types: list[str] = []
        for message in messages:
            content, found = await self.redact_text(message.content)
            redacted.append(ChatMessage(role=message.role, content=content))
            types = unique_entity_types(types, found)
        return redacted, types

    async def redact_hits(self, hits: list[MemoryHit]) -> list[MemoryHit]:
        redacted: list[MemoryHit] = []
        for hit in hits:
            text, _ = await self.redact_text(hit.memory)
            redacted.append(MemoryHit(id=hit.id, memory=text, score=hit.score))
        return redacted

    async def redact_result_rows(self, rows: list[dict]) -> list[dict]:
        redacted: list[dict] = []
        for row in rows:
            if not isinstance(row, dict):
                redacted.append(row)
                continue
            item = dict(row)
            memory = item.get("memory")
            if isinstance(memory, str) and memory:
                item["memory"], _ = await self.redact_text(memory)
            redacted.append(item)
        return redacted
