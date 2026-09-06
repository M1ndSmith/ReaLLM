from __future__ import annotations

import asyncio
import logging
import os
import threading
from pathlib import Path

from dotenv import load_dotenv

from app.schemas import ChatMessage, MemoryHit, PiiInfo

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

_DEFAULT_ENTITIES = (
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "CREDIT_CARD",
    "US_SSN",
    "IBAN_CODE",
    "IP_ADDRESS",
)
_DEFAULT_SPACY_MODEL = "en_core_web_sm"
_LANGUAGE = "en"

_lock = threading.Lock()
_engines: tuple[object, object] | None = None


class PiiConfigError(ValueError):
    """Raised when PII is on but Presidio or spaCy cannot be used."""


def pii_enabled() -> bool:
    raw = (os.getenv("PII") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _env_flag(name: str) -> str:
    return (os.getenv(name) or "").strip()


def configured_entities() -> list[str]:
    raw = _env_flag("PII_ENTITIES")
    if not raw:
        return list(_DEFAULT_ENTITIES)
    entities = [item.strip() for item in raw.split(",") if item.strip()]
    return entities or list(_DEFAULT_ENTITIES)


def spacy_model_name() -> str:
    return _env_flag("PII_SPACY_MODEL") or _DEFAULT_SPACY_MODEL


def unique_entity_types(*groups: list[str]) -> list[str]:
    seen: list[str] = []
    for group in groups:
        for item in group:
            if item and item not in seen:
                seen.append(item)
    return seen


def pii_status() -> PiiInfo:
    if not pii_enabled():
        return PiiInfo(enabled=False)
    return PiiInfo(enabled=True, engine="presidio", entities=configured_entities())


def _ensure_spacy_model(model_name: str) -> None:
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


def _build_engines() -> tuple[object, object]:
    model_name = spacy_model_name()
    _ensure_spacy_model(model_name)
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


def get_engines() -> tuple[object, object]:
    global _engines
    if not pii_enabled():
        raise PiiConfigError("PII is disabled. Set PII=1.")
    if _engines is not None:
        return _engines
    with _lock:
        if _engines is not None:
            return _engines
        _engines = _build_engines()
        return _engines


def _redact_text_sync(text: str) -> tuple[str, list[str]]:
    analyzer, anonymizer = get_engines()
    entities = configured_entities()
    try:
        results = analyzer.analyze(text=text, language=_LANGUAGE, entities=entities)
        anonymized = anonymizer.anonymize(text=text, analyzer_results=results)
    except Exception as exc:
        raise PiiConfigError(f"PII redaction failed: {exc}") from exc
    types = unique_entity_types(
        [str(getattr(item, "entity_type", "") or "") for item in (results or [])]
    )
    redacted = getattr(anonymized, "text", None)
    if not isinstance(redacted, str):
        redacted = str(anonymized)
    return redacted, types


async def redact_text(text: str) -> tuple[str, list[str]]:
    if not pii_enabled() or not text:
        return text, []
    return await asyncio.to_thread(_redact_text_sync, text)


async def redact_messages(messages: list[ChatMessage]) -> tuple[list[ChatMessage], list[str]]:
    if not pii_enabled():
        return list(messages), []
    redacted: list[ChatMessage] = []
    types: list[str] = []
    for message in messages:
        content, found = await redact_text(message.content)
        redacted.append(ChatMessage(role=message.role, content=content))
        types = unique_entity_types(types, found)
    return redacted, types


async def redact_hits(hits: list[MemoryHit]) -> list[MemoryHit]:
    if not pii_enabled():
        return list(hits)
    redacted: list[MemoryHit] = []
    for hit in hits:
        text, _ = await redact_text(hit.memory)
        redacted.append(MemoryHit(id=hit.id, memory=text, score=hit.score))
    return redacted


async def redact_result_rows(rows: list[dict]) -> list[dict]:
    if not pii_enabled():
        return list(rows)
    redacted: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            redacted.append(row)
            continue
        item = dict(row)
        memory = item.get("memory")
        if isinstance(memory, str) and memory:
            item["memory"], _ = await redact_text(memory)
        redacted.append(item)
    return redacted
