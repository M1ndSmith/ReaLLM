from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

from app.schemas import ChatMessage, GuardInfo

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

_DEFAULT_INJECTION_MODEL = "groq/meta-llama/llama-prompt-guard-2-22m"
_DEFAULT_CONTENT_MODEL = "groq/meta-llama/llama-guard-4-12b"
_INJECTION_WINDOW = 512
_INJECTION_MAX_TOKENS = 16
_CONTENT_MAX_TOKENS = 64
_ON = {"1", "true", "yes", "on"}
_OFF = {"0", "false", "no", "off", "none"}
_CONTENT_CATEGORY_NAMES = {
    "S1": "Violent Crimes",
    "S2": "Non-Violent Crimes",
    "S3": "Sex-Related Crimes",
    "S4": "Child Sexual Exploitation",
    "S5": "Defamation",
    "S6": "Specialized Advice",
    "S7": "Privacy",
    "S8": "Intellectual Property",
    "S9": "Indiscriminate Weapons",
    "S10": "Hate",
    "S11": "Suicide & Self-Harm",
    "S12": "Sexual Content",
    "S13": "Elections",
    "S14": "Code Interpreter Abuse",
}


class GuardConfigError(ValueError):
    """Raised when GUARD=1 but scanners or catalog models cannot be used."""


class GuardBlockedError(ValueError):
    """Raised when a scanner blocks the request. HTTP 400. Never includes the raw text."""

    def __init__(
        self,
        scanner: str,
        message: str,
        categories: list[str] | None = None,
        category_names: list[str] | None = None,
    ):
        super().__init__(message)
        self.scanner = scanner
        self.categories = list(categories or [])
        self.category_names = list(category_names or [])


def guard_enabled() -> bool:
    raw = (os.getenv("GUARD") or "").strip().lower()
    return raw in _ON


def _env_flag(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _tri_flag(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    if raw in _OFF:
        return False
    if raw in _ON:
        return True
    return default


def injection_enabled() -> bool:
    return guard_enabled() and _tri_flag("GUARD_INJECTION", True)


def content_enabled() -> bool:
    return guard_enabled() and _tri_flag("GUARD_CONTENT", True)


def requested_injection_model() -> str:
    return _env_flag("GUARD_INJECTION_MODEL") or _DEFAULT_INJECTION_MODEL


def requested_content_model() -> str:
    return _env_flag("GUARD_CONTENT_MODEL") or _DEFAULT_CONTENT_MODEL


def ignored_content_categories(*, strict: bool = True) -> list[str]:
    raw = _env_flag("GUARD_CONTENT_IGNORE")
    if not raw:
        return []
    codes: list[str] = []
    for part in raw.split(","):
        code = part.strip().upper()
        if not code:
            continue
        if code not in _CONTENT_CATEGORY_NAMES:
            if strict:
                raise GuardConfigError(
                    f"GUARD_CONTENT_IGNORE contains unknown category '{code}'. Use S1–S14."
                )
            continue
        if code not in codes:
            codes.append(code)
    return codes


def category_names_for(codes: list[str]) -> list[str]:
    return [_CONTENT_CATEGORY_NAMES.get(code, code) for code in codes]


def guard_status() -> GuardInfo:
    if not guard_enabled():
        return GuardInfo(enabled=False)
    content_on = content_enabled()
    return GuardInfo(
        enabled=True,
        injection=injection_enabled(),
        content=content_on,
        injection_model=requested_injection_model() if injection_enabled() else None,
        content_model=requested_content_model() if content_on else None,
        content_ignore=ignored_content_categories(strict=False) if content_on else [],
    )


def _ensure_scanners() -> None:
    if not guard_enabled():
        return
    if not injection_enabled() and not content_enabled():
        raise GuardConfigError("GUARD=1 requires GUARD_INJECTION or GUARD_CONTENT to be on.")
    if content_enabled():
        ignored_content_categories(strict=True)


def _resolve_guard_model(requested: str, kind: str) -> str:
    from app.llm import UnknownModelError, resolve_model

    try:
        return resolve_model(requested)
    except UnknownModelError as exc:
        raise GuardConfigError(
            f"Guard {kind} model '{requested}' is not in the catalog. "
            "Set GROQ_API_KEY or GUARD_INJECTION_MODEL / GUARD_CONTENT_MODEL to a catalog id."
        ) from exc


def injection_is_malicious(text: str) -> bool:
    lowered = (text or "").strip().lower()
    if not lowered:
        raise GuardConfigError("Prompt Guard returned empty text.")
    head = lowered.splitlines()[0].strip()
    token = head.split()[0] if head.split() else head
    if token in {"malicious", "1", "label_1", "label1", "unsafe"}:
        return True
    if token in {"benign", "0", "label_0", "label0", "safe"}:
        return False
    if "malicious" in head and "benign" not in head:
        return True
    if head == "benign" or head.startswith("benign"):
        return False
    raise GuardConfigError("Prompt Guard returned an unrecognized verdict.")


def parse_content_verdict(text: str) -> tuple[bool, list[str]]:
    stripped = (text or "").strip()
    if not stripped:
        raise GuardConfigError("Llama Guard returned empty text.")
    lines = [line.strip() for line in stripped.splitlines() if line.strip()]
    head = lines[0].lower()
    if head == "unsafe" or head.startswith("unsafe"):
        categories = [line.upper() for line in lines[1:] if line]
        return True, categories
    if head == "safe":
        return False, []
    raise GuardConfigError("Llama Guard returned an unrecognized verdict.")


def _chunk_text(model: str, text: str, limit: int = _INJECTION_WINDOW) -> list[str]:
    from app.budget import token_count_text

    cleaned = text.strip()
    if not cleaned:
        return []
    if token_count_text(model, cleaned) <= limit:
        return [cleaned]
    mid = max(1, len(cleaned) // 2)
    split = cleaned.rfind(" ", 0, mid)
    if split < 1:
        split = mid
    return _chunk_text(model, cleaned[:split], limit) + _chunk_text(model, cleaned[split:], limit)


def _inbound_injection_blob(messages: list[ChatMessage]) -> str:
    parts = [item.content.strip() for item in messages if item.role in {"user", "system"} and item.content.strip()]
    return "\n\n".join(parts)


def _inbound_system_blob(messages: list[ChatMessage]) -> str:
    parts = [item.content.strip() for item in messages if item.role == "system" and item.content.strip()]
    return "\n\n".join(parts)


def _memory_write_blob(messages: list[ChatMessage]) -> str:
    return "\n\n".join(item.content.strip() for item in messages if item.content.strip())


def _latest_user_text(messages: list[ChatMessage]) -> str:
    for item in reversed(messages):
        if item.role == "user" and item.content.strip():
            return item.content
    return ""


async def _classify(
    model: str,
    messages: list[dict],
    *,
    generation_name: str,
    max_tokens: int,
) -> str:
    from app.budget import completion_usd, record_usage
    from app.reliability import get_router

    router = get_router()
    params: dict = {
        "model": model,
        "messages": messages,
        "caching": False,
        "fallbacks": [],
        "max_tokens": max_tokens,
        "metadata": {
            "generation_name": generation_name,
            "trace_name": generation_name,
            "tags": ["realmm", "guard"],
        },
    }
    try:
        response = await router.acompletion(**params)
    except GuardBlockedError:
        raise
    except GuardConfigError:
        raise
    except Exception as exc:
        raise GuardConfigError(f"Guard {generation_name} call failed: {exc}") from exc
    usage = getattr(response, "usage", None)
    tokens = getattr(usage, "total_tokens", None) if usage is not None else None
    hidden = getattr(response, "_hidden_params", None)
    cached = isinstance(hidden, dict) and hidden.get("cache_hit") is True
    record_usage(tokens=tokens, usd=completion_usd(response, model), cached=cached)
    choices = getattr(response, "choices", None)
    if not choices:
        raise GuardConfigError(f"Guard {generation_name} returned no choices.")
    message = getattr(choices[0], "message", None)
    content = getattr(message, "content", None) if message is not None else None
    if not isinstance(content, str):
        raise GuardConfigError(f"Guard {generation_name} returned no text.")
    return content


async def scan_injection(text: str) -> None:
    if not injection_enabled() or not text.strip():
        return
    model = _resolve_guard_model(requested_injection_model(), "injection")
    chunks = _chunk_text(model, text)
    if not chunks:
        return

    async def _one(chunk: str) -> None:
        verdict = await _classify(
            model,
            [{"role": "user", "content": chunk}],
            generation_name="guard-injection",
            max_tokens=_INJECTION_MAX_TOKENS,
        )
        if injection_is_malicious(verdict):
            raise GuardBlockedError("injection", "Prompt injection blocked.")

    await asyncio.gather(*[_one(chunk) for chunk in chunks])


async def scan_content(text: str, role: str) -> None:
    if not content_enabled() or not text.strip():
        return
    if role not in {"user", "assistant"}:
        raise GuardConfigError("Llama Guard role must be user or assistant.")
    model = _resolve_guard_model(requested_content_model(), "content")
    verdict = await _classify(
        model,
        [{"role": role, "content": text}],
        generation_name="guard-content",
        max_tokens=_CONTENT_MAX_TOKENS,
    )
    unsafe, categories = parse_content_verdict(verdict)
    if not unsafe:
        return
    ignore = set(ignored_content_categories(strict=True))
    remaining = [code for code in categories if code not in ignore]
    if categories and not remaining:
        return
    names = category_names_for(remaining)
    label = ", ".join(remaining) if remaining else "unsafe"
    raise GuardBlockedError("content", f"Unsafe content blocked ({label}).", remaining, names)


async def assert_inbound(messages: list[ChatMessage]) -> None:
    if not guard_enabled():
        return
    _ensure_scanners()
    tasks = []
    if injection_enabled():
        tasks.append(scan_injection(_inbound_injection_blob(messages)))
    if content_enabled():
        user_text = _latest_user_text(messages)
        system_text = _inbound_system_blob(messages)
        if user_text:
            tasks.append(scan_content(user_text, "user"))
        if system_text:
            tasks.append(scan_content(system_text, "user"))
    if tasks:
        await asyncio.gather(*tasks)


async def assert_outbound(assistant: str) -> None:
    if not guard_enabled() or not content_enabled():
        return
    _ensure_scanners()
    await scan_content(assistant, "assistant")


async def assert_memory_write(messages: list[ChatMessage]) -> None:
    if not guard_enabled() or not content_enabled():
        return
    _ensure_scanners()
    await scan_content(_memory_write_blob(messages), "user")
