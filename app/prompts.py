from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import httpx
from dotenv import load_dotenv

from app.schemas import ChatMessage, PromptListItem

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_ROOT = Path(__file__).resolve().parent.parent
_PROMPTS_DIR = _ROOT / "prompts"
_VAR_PATTERN = re.compile(r"\{\{\s*(\w+)\s*\}\}")

PromptSource = Literal["langfuse", "local", "fallback"]


class UnknownPromptError(ValueError):
    """Raised when a named prompt cannot be resolved."""


@dataclass(frozen=True)
class PromptMeta:
    name: str
    version: int | None
    source: PromptSource


def _langfuse_base_url() -> str:
    return (
        (os.getenv("LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_HOST") or "https://cloud.langfuse.com").strip().rstrip("/")
    )


def prompts_enabled() -> bool:
    public = (os.getenv("LANGFUSE_PUBLIC_KEY") or "").strip()
    secret = (os.getenv("LANGFUSE_SECRET_KEY") or "").strip()
    return bool(public and secret)


def prompts_source() -> Literal["langfuse", "local", "off"]:
    if prompts_enabled():
        return "langfuse"
    if list(_iter_local_files()):
        return "local"
    return "off"


def _ensure_langfuse_env() -> None:
    base = os.getenv("LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_HOST")
    if not base:
        return
    os.environ.setdefault("LANGFUSE_BASE_URL", base)
    os.environ.setdefault("LANGFUSE_HOST", base)


def _get_langfuse_client():
    if not prompts_enabled():
        return None
    _ensure_langfuse_env()
    from langfuse import get_client

    return get_client()


def _iter_local_files() -> list[Path]:
    if not _PROMPTS_DIR.is_dir():
        return []
    return sorted(_PROMPTS_DIR.glob("*.json"))


def _load_local_record(name: str) -> dict[str, Any] | None:
    path = _PROMPTS_DIR / f"{name}.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return data


def _compile_text(text: str, variables: dict[str, str] | None) -> str:
    values = variables or {}

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key in values:
            return str(values[key])
        return match.group(0)

    return _VAR_PATTERN.sub(replace, text)


def _messages_from_local(record: dict[str, Any], variables: dict[str, str] | None) -> list[ChatMessage]:
    prompt_type = record.get("type", "chat")
    body = record.get("prompt")
    if prompt_type == "text" or isinstance(body, str):
        content = _compile_text(str(body or ""), variables)
        return [ChatMessage(role="system", content=content)]
    if not isinstance(body, list):
        raise UnknownPromptError("Local prompt is missing a chat message list.")
    messages: list[ChatMessage] = []
    for item in body:
        if not isinstance(item, dict):
            continue
        role = item.get("role", "system")
        if role not in {"system", "user", "assistant"}:
            continue
        content = _compile_text(str(item.get("content", "")), variables)
        messages.append(ChatMessage(role=role, content=content))
    if not messages:
        raise UnknownPromptError("Local prompt has no usable messages.")
    return messages


def _fallback_chat(name: str) -> list[dict[str, str]]:
    record = _load_local_record(name)
    if record is None:
        return [{"role": "system", "content": "You are a helpful assistant."}]
    body = record.get("prompt")
    if isinstance(body, str):
        return [{"role": "system", "content": body}]
    if isinstance(body, list):
        messages = []
        for item in body:
            if isinstance(item, dict) and item.get("content"):
                role = item.get("role", "system")
                if role in {"system", "user", "assistant"}:
                    messages.append({"role": role, "content": str(item["content"])})
        if messages:
            return messages
    return [{"role": "system", "content": "You are a helpful assistant."}]


def _coerce_messages(compiled: Any) -> list[ChatMessage]:
    if isinstance(compiled, str):
        return [ChatMessage(role="system", content=compiled)]
    if isinstance(compiled, list):
        messages: list[ChatMessage] = []
        for item in compiled:
            if isinstance(item, ChatMessage):
                messages.append(item)
                continue
            if not isinstance(item, dict):
                continue
            role = item.get("role", "system")
            if role not in {"system", "user", "assistant"}:
                continue
            messages.append(ChatMessage(role=role, content=str(item.get("content", ""))))
        return messages
    raise UnknownPromptError("Compiled prompt is not a string or message list.")


def _sdk_fallback(name: str, record: dict[str, Any]) -> str | list[dict[str, str]]:
    body = record.get("prompt")
    if record.get("type") == "text" or isinstance(body, str):
        return str(body or "")
    return _fallback_chat(name)


def _prompt_types_to_try(record: dict[str, Any] | None) -> list[str]:
    if record is None:
        return ["chat", "text"]
    if record.get("type") == "text" or isinstance(record.get("prompt"), str):
        return ["text", "chat"]
    return ["chat", "text"]


def _fetch_langfuse_prompt(client: Any, name: str, fetch_kwargs: dict[str, Any], record: dict[str, Any] | None):
    errors: list[Exception] = []
    for prompt_type in _prompt_types_to_try(record):
        kwargs = dict(fetch_kwargs)
        try:
            return client.get_prompt(name, type=prompt_type, **kwargs)
        except TypeError:
            try:
                return client.get_prompt(name, **kwargs)
            except Exception as exc:
                errors.append(exc)
                break
        except Exception as exc:
            errors.append(exc)
    if errors:
        raise errors[-1]
    raise UnknownPromptError(f"Unknown prompt '{name}'.")


def resolve_prompt(
    name: str,
    *,
    label: str | None = None,
    version: int | None = None,
    variables: dict[str, str] | None = None,
) -> tuple[list[ChatMessage], PromptMeta]:
    record = _load_local_record(name)
    client = _get_langfuse_client()
    if client is not None:
        fetch_kwargs: dict[str, Any] = {}
        if version is not None:
            fetch_kwargs["version"] = version
        else:
            fetch_kwargs["label"] = label or "production"
        if record is not None:
            fetch_kwargs["fallback"] = _sdk_fallback(name, record)
        try:
            prompt_obj = _fetch_langfuse_prompt(client, name, fetch_kwargs, record)
            compiled = prompt_obj.compile(**(variables or {}))
            messages = _coerce_messages(compiled)
            if not messages:
                raise UnknownPromptError(f"Prompt '{name}' compiled to no messages.")
            source: PromptSource = "fallback" if getattr(prompt_obj, "is_fallback", False) else "langfuse"
            if source == "fallback" and record is not None:
                source = "local"
            version_value = getattr(prompt_obj, "version", None)
            return messages, PromptMeta(
                name=name,
                version=version_value if isinstance(version_value, int) else None,
                source=source,
            )
        except UnknownPromptError:
            raise
        except Exception:
            if record is None:
                raise UnknownPromptError(f"Unknown prompt '{name}'.") from None
            return _messages_from_local(record, variables), PromptMeta(name=name, version=None, source="local")

    if record is None:
        raise UnknownPromptError(f"Unknown prompt '{name}'.")
    return _messages_from_local(record, variables), PromptMeta(name=name, version=None, source="local")


def prepare_messages(
    messages: list[ChatMessage],
    prompt: str | None = None,
    prompt_label: str | None = None,
    prompt_version: int | None = None,
    variables: dict[str, str] | None = None,
) -> tuple[list[ChatMessage], PromptMeta | None]:
    if not prompt:
        return list(messages), None
    compiled, meta = resolve_prompt(
        prompt,
        label=prompt_label,
        version=prompt_version,
        variables=variables,
    )
    return compiled + list(messages), meta


def list_prompts() -> list[PromptListItem]:
    found: dict[str, PromptListItem] = {}
    for path in _iter_local_files():
        found[path.stem] = PromptListItem(name=path.stem, source="local")
    if prompts_enabled():
        for name in _list_langfuse_names():
            found[name] = PromptListItem(name=name, source="langfuse")
    return sorted(found.values(), key=lambda item: item.name)


def _list_langfuse_names() -> list[str]:
    public = (os.getenv("LANGFUSE_PUBLIC_KEY") or "").strip()
    secret = (os.getenv("LANGFUSE_SECRET_KEY") or "").strip()
    url = f"{_langfuse_base_url()}/api/public/v2/prompts"
    names: list[str] = []
    page = 1
    while page <= 10:
        try:
            response = httpx.get(
                url,
                auth=(public, secret),
                params={"page": page, "limit": 100},
                timeout=10.0,
            )
            response.raise_for_status()
            payload = response.json()
        except Exception:
            break
        rows = payload.get("data", payload) if isinstance(payload, dict) else payload
        if not isinstance(rows, list) or not rows:
            break
        for row in rows:
            if isinstance(row, str):
                names.append(row)
            elif isinstance(row, dict) and row.get("name"):
                names.append(str(row["name"]))
        meta = payload.get("meta") if isinstance(payload, dict) else None
        total_pages = meta.get("totalPages") if isinstance(meta, dict) else None
        if isinstance(total_pages, int) and page >= total_pages:
            break
        if len(rows) < 100:
            break
        page += 1
    return names
