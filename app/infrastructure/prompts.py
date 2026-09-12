from __future__ import annotations

import asyncio
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

import httpx

from app.application.errors import UnknownPromptError
from app.application.models import PromptMeta, PromptSource
from app.schemas import ChatMessage, PromptListItem
from app.settings import GatewaySettings

_VAR_PATTERN = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_REMOTE_CACHE_TTL_SECONDS = 60.0


class PromptRepository:
    def __init__(self, settings: GatewaySettings, *, prompts_dir: Path):
        self._settings = settings
        self._prompts_dir = prompts_dir
        self._tracing_ready = False
        self._remote_lock = threading.Lock()
        self._remote_names: list[str] = []
        self._remote_at: float = 0.0
        self._refresh_pending = False

    def prompts_enabled(self) -> bool:
        return self._settings.prompts_enabled()

    def tracing_enabled(self) -> bool:
        return self._settings.tracing_on()

    def prompts_source(self) -> str:
        if self.prompts_enabled():
            return "langfuse"
        if list(self._iter_local_files()):
            return "local"
        return "off"

    def _langfuse_base_url(self) -> str:
        return self._settings.langfuse_base_url.rstrip("/")

    def _ensure_langfuse_env(self) -> None:
        base = self._langfuse_base_url()
        os.environ.setdefault("LANGFUSE_BASE_URL", base)
        os.environ.setdefault("LANGFUSE_HOST", base)

    def ensure_tracing(self) -> None:
        if self._tracing_ready or not self.tracing_enabled():
            return
        self._ensure_langfuse_env()
        import litellm

        current = list(litellm.callbacks) if litellm.callbacks else []
        if "langfuse_otel" not in current:
            litellm.callbacks = [*current, "langfuse_otel"]
        self._tracing_ready = True

    def _get_langfuse_client(self):
        if not self.prompts_enabled():
            return None
        self._ensure_langfuse_env()
        from langfuse import get_client

        return get_client()

    def _iter_local_files(self) -> list[Path]:
        if not self._prompts_dir.is_dir():
            return []
        return sorted(self._prompts_dir.glob("*.json"))

    def _load_local_record(self, name: str) -> dict[str, Any] | None:
        path = self._prompts_dir / f"{name}.json"
        if not path.is_file():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(data, dict):
            return None
        return data

    def _compile_text(self, text: str, variables: dict[str, str] | None) -> str:
        values = variables or {}

        def replace(match: re.Match[str]) -> str:
            key = match.group(1)
            if key in values:
                return str(values[key])
            return match.group(0)

        return _VAR_PATTERN.sub(replace, text)

    def _messages_from_local(self, record: dict[str, Any], variables: dict[str, str] | None) -> list[ChatMessage]:
        prompt_type = record.get("type", "chat")
        body = record.get("prompt")
        if prompt_type == "text" or isinstance(body, str):
            content = self._compile_text(str(body or ""), variables)
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
            content = self._compile_text(str(item.get("content", "")), variables)
            messages.append(ChatMessage(role=role, content=content))
        if not messages:
            raise UnknownPromptError("Local prompt has no usable messages.")
        return messages

    def _fallback_chat(self, name: str) -> list[dict[str, str]]:
        record = self._load_local_record(name)
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

    def _coerce_messages(self, compiled: Any) -> list[ChatMessage]:
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

    def _sdk_fallback(self, name: str, record: dict[str, Any]) -> str | list[dict[str, str]]:
        body = record.get("prompt")
        if record.get("type") == "text" or isinstance(body, str):
            return str(body or "")
        return self._fallback_chat(name)

    def _prompt_types_to_try(self, record: dict[str, Any] | None) -> list[str]:
        if record is None:
            return ["chat", "text"]
        if record.get("type") == "text" or isinstance(record.get("prompt"), str):
            return ["text", "chat"]
        return ["chat", "text"]

    def _fetch_langfuse_prompt(
        self, client: Any, name: str, fetch_kwargs: dict[str, Any], record: dict[str, Any] | None
    ):
        errors: list[Exception] = []
        for prompt_type in self._prompt_types_to_try(record):
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
        self,
        name: str,
        *,
        label: str | None = None,
        version: int | None = None,
        variables: dict[str, str] | None = None,
    ) -> tuple[list[ChatMessage], PromptMeta]:
        record = self._load_local_record(name)
        client = self._get_langfuse_client()
        if client is not None:
            fetch_kwargs: dict[str, Any] = {}
            if version is not None:
                fetch_kwargs["version"] = version
            else:
                fetch_kwargs["label"] = label or "production"
            if record is not None:
                fetch_kwargs["fallback"] = self._sdk_fallback(name, record)
            try:
                prompt_obj = self._fetch_langfuse_prompt(client, name, fetch_kwargs, record)
                compiled = prompt_obj.compile(**(variables or {}))
                messages = self._coerce_messages(compiled)
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
                return self._messages_from_local(record, variables), PromptMeta(name=name, version=None, source="local")

        if record is None:
            raise UnknownPromptError(f"Unknown prompt '{name}'.")
        return self._messages_from_local(record, variables), PromptMeta(name=name, version=None, source="local")

    def prepare_messages(
        self,
        messages: list[ChatMessage],
        prompt: str | None = None,
        prompt_label: str | None = None,
        prompt_version: int | None = None,
        variables: dict[str, str] | None = None,
    ) -> tuple[list[ChatMessage], PromptMeta | None]:
        if not prompt:
            return list(messages), None
        compiled, meta = self.resolve_prompt(
            prompt,
            label=prompt_label,
            version=prompt_version,
            variables=variables,
        )
        return compiled + list(messages), meta

    def list_prompts(self) -> list[PromptListItem]:
        found: dict[str, PromptListItem] = {}
        for path in self._iter_local_files():
            found[path.stem] = PromptListItem(name=path.stem, source="local")
        if self.prompts_enabled():
            for name in self.cached_langfuse_names():
                found[name] = PromptListItem(name=name, source="langfuse")
        return sorted(found.values(), key=lambda item: item.name)

    def cached_langfuse_names(self) -> list[str]:
        now = time.monotonic()
        with self._remote_lock:
            if self._remote_at and now - self._remote_at < _REMOTE_CACHE_TTL_SECONDS:
                return list(self._remote_names)
            stale = list(self._remote_names) if self._remote_at else None
            if stale is not None:
                self._schedule_refresh_unlocked()
                return stale
        return self._list_langfuse_names()

    def _schedule_refresh_unlocked(self) -> None:
        if self._refresh_pending:
            return
        self._refresh_pending = True
        threading.Thread(target=self._refresh_worker, name="realmm-prompt-refresh", daemon=True).start()

    def _refresh_worker(self) -> None:
        try:
            self._list_langfuse_names()
        finally:
            with self._remote_lock:
                self._refresh_pending = False

    async def refresh_async(self) -> None:
        if not self.prompts_enabled():
            return
        await asyncio.to_thread(self._list_langfuse_names)

    def _list_langfuse_names(self) -> list[str]:
        public = self._settings.langfuse_public()
        secret = self._settings.langfuse_secret()
        url = f"{self._langfuse_base_url()}/api/public/v2/prompts"
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
        with self._remote_lock:
            self._remote_names = names
            self._remote_at = time.monotonic()
        return names
