from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from pathlib import Path

from app.application.errors import MemoryConfigError, UnknownModelError
from app.application.models import RuntimeFlags
from app.application.ports import CompletionBackend, ModelCatalogPort, UsageBudgetPort
from app.schemas import ChatMessage, MemoryHit, MemoryInfo

_DEFAULT_USER_ID = "local"
_FASTEMBED_MODEL = "BAAI/bge-small-en-v1.5"
_FASTEMBED_DIMS = 384
_OPENAI_EMBED_MODEL = "text-embedding-3-small"
_OPENAI_EMBED_DIMS = 1536
_EXTRACT_MAX_TOKENS = 512
_SEARCH_TOP_K = 5

logger = logging.getLogger(__name__)


class RouterLLM:
    """Mem0-compatible LLM that calls the existing LiteLLM Router via CompletionBackend."""

    def __init__(
        self,
        model: str,
        backend: CompletionBackend,
        budget: UsageBudgetPort,
        *,
        temperature: float = 0.1,
        max_tokens: int = _EXTRACT_MAX_TOKENS,
    ):
        self._backend = backend
        self._budget = budget
        self.identity_id: str | None = None
        self.config = type(
            "RouterLlmConfig",
            (),
            {
                "model": model,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "top_p": 0.1,
            },
        )()

    def generate_response(
        self,
        messages: list[dict],
        response_format=None,
        tools: list[dict] | None = None,
        tool_choice: str = "auto",
        **kwargs,
    ):
        model = self.config.model
        params: dict = {
            "model": model,
            "messages": messages,
            "temperature": self.config.temperature,
            "top_p": self.config.top_p,
            "max_tokens": self.config.max_tokens,
            "caching": False,
        }
        fallbacks = self._backend.chat_fallback_ids(model)
        if fallbacks:
            params["fallbacks"] = fallbacks
        if response_format is not None:
            params["response_format"] = response_format
        if tools:
            params["tools"] = tools
            params["tool_choice"] = tool_choice
        params.update(kwargs)
        meta = params.get("metadata")
        if not isinstance(meta, dict):
            meta = {}
        else:
            meta = dict(meta)
        meta.setdefault("generation_name", "mem0-extract")
        meta.setdefault("trace_name", "mem0-extract")
        tags = meta.get("tags")
        if not isinstance(tags, list):
            tags = []
        for tag in ("realmm", "mem0"):
            if tag not in tags:
                tags.append(tag)
        meta["tags"] = tags
        params["metadata"] = meta

        response = self._backend.completion(**params)
        usage = getattr(response, "usage", None)
        tokens = getattr(usage, "total_tokens", None) if usage is not None else None
        hidden = getattr(response, "_hidden_params", None)
        cached = isinstance(hidden, dict) and hidden.get("cache_hit") is True
        self._budget.record_usage(
            tokens=tokens,
            usd=self._budget.completion_usd(response, model),
            cached=cached,
            identity_id=self.identity_id,
        )
        return _parse_llm_response(response, tools)


def resolve_scope(
    user_id: str | None,
    conversation_id: str | None,
    agent_id: str | None,
) -> dict[str, str]:
    scope: dict[str, str] = {}
    user = (user_id or "").strip() or _DEFAULT_USER_ID
    scope["user_id"] = user
    run_id = (conversation_id or "").strip()
    if run_id:
        scope["run_id"] = run_id
    agent = (agent_id or "").strip()
    if agent:
        scope["agent_id"] = agent
    return scope


def inject_memories(messages: list[ChatMessage], memories: list[str]) -> list[ChatMessage]:
    if not memories:
        return list(messages)
    block = ChatMessage(
        role="system",
        content="Relevant memory:\n" + "\n".join(f"- {item}" for item in memories),
    )
    index = 0
    while index < len(messages) and messages[index].role == "system":
        index += 1
    return list(messages[:index]) + [block] + list(messages[index:])


def _latest_user_text(messages: list[ChatMessage] | list[dict]) -> str:
    for message in reversed(messages):
        if isinstance(message, ChatMessage):
            role, content = message.role, message.content
        else:
            role, content = str(message.get("role", "")), str(message.get("content") or "")
        if role == "user" and content.strip():
            return content.strip()
    return ""


def _parse_llm_response(response: object, tools: list | None):
    choice = response.choices[0]
    message = choice.message
    if not tools:
        return getattr(message, "content", None) or ""
    processed = {"content": getattr(message, "content", None), "tool_calls": []}
    tool_calls = getattr(message, "tool_calls", None) or []
    for tool_call in tool_calls:
        function = getattr(tool_call, "function", None)
        name = getattr(function, "name", None) if function is not None else None
        raw_args = getattr(function, "arguments", None) if function is not None else None
        if not name:
            continue
        if isinstance(raw_args, dict):
            arguments = raw_args
        else:
            try:
                arguments = json.loads(raw_args or "{}")
            except json.JSONDecodeError:
                arguments = {}
        processed["tool_calls"].append({"name": name, "arguments": arguments})
    return processed


class MemoryRuntime:
    def __init__(
        self,
        settings,
        catalog: ModelCatalogPort,
        backend: CompletionBackend,
        budget: UsageBudgetPort,
        *,
        mem0_dir: Path,
    ):
        self._settings = settings
        self._catalog = catalog
        self._backend = backend
        self._budget = budget
        self._mem0_dir = mem0_dir
        self._qdrant_path = mem0_dir / "qdrant"
        self._history_db = mem0_dir / "history.db"
        self._lock = threading.Lock()
        self._ops_lock = threading.Lock()
        self._memory = None
        self._background: set[asyncio.Task] = set()
        self._accepting = True
        os.environ.setdefault("MEM0_DIR", str(mem0_dir))
        os.environ.setdefault("MEM0_TELEMETRY", "False")

    def enabled(self, flags: RuntimeFlags) -> bool:
        return flags.memory

    def _embedder_provider(self) -> str:
        raw = (self._settings.memory_embedder or "fastembed").strip().lower() or "fastembed"
        if raw in {"fastembed", "openai"}:
            return raw
        raise MemoryConfigError("MEMORY_EMBEDDER must be fastembed or openai.")

    def _llm_model_id(self) -> str | None:
        requested = (self._settings.memory_llm_model or "").strip()
        if requested:
            try:
                return self._catalog.resolve_model(requested)
            except UnknownModelError as exc:
                raise MemoryConfigError(str(exc)) from exc
        for item in self._catalog.list_available_models():
            if self._catalog.is_chat_model(item.id):
                return item.id
        return None

    def status(self, flags: RuntimeFlags) -> MemoryInfo:
        if not flags.memory:
            return MemoryInfo(enabled=False)
        try:
            embedder = self._embedder_provider()
        except MemoryConfigError:
            embedder = self._settings.memory_embedder or "fastembed"
        try:
            llm_id = self._llm_model_id()
        except MemoryConfigError:
            llm_id = self._settings.memory_llm_model or None
        return MemoryInfo(
            enabled=True,
            llm=llm_id,
            embedder=embedder,
            vector="qdrant",
        )

    def _build_memory(self):
        model = self._llm_model_id()
        if not model:
            raise MemoryConfigError("Memory needs a chat model. Set MEMORY_LLM_MODEL or add a PROVIDER_API_KEY.")

        embedder = self._embedder_provider()
        if embedder == "openai":
            if not (os.getenv("OPENAI_API_KEY") or "").strip():
                raise MemoryConfigError("MEMORY_EMBEDDER=openai requires OPENAI_API_KEY.")
            embedder_config = {
                "provider": "openai",
                "config": {"model": _OPENAI_EMBED_MODEL, "embedding_dims": _OPENAI_EMBED_DIMS},
            }
            dims = _OPENAI_EMBED_DIMS
        else:
            embedder_config = {
                "provider": "fastembed",
                "config": {"model": _FASTEMBED_MODEL, "embedding_dims": _FASTEMBED_DIMS},
            }
            dims = _FASTEMBED_DIMS

        self._mem0_dir.mkdir(parents=True, exist_ok=True)
        self._qdrant_path.mkdir(parents=True, exist_ok=True)

        from mem0 import Memory

        memory = Memory.from_config(
            {
                "llm": {
                    "provider": "litellm",
                    "config": {
                        "model": model,
                        "temperature": 0.1,
                        "max_tokens": _EXTRACT_MAX_TOKENS,
                    },
                },
                "embedder": embedder_config,
                "vector_store": {
                    "provider": "qdrant",
                    "config": {
                        "collection_name": "realmm",
                        "embedding_model_dims": dims,
                        "path": str(self._qdrant_path),
                        "on_disk": True,
                    },
                },
                "history_db_path": str(self._history_db),
            }
        )
        memory.llm = RouterLLM(model, self._backend, self._budget)
        return memory

    def get_memory(self, flags: RuntimeFlags | None = None):
        if flags is not None and not flags.memory:
            return None
        if self._memory is not None:
            return self._memory
        with self._lock:
            if self._memory is not None:
                return self._memory
            self._memory = self._build_memory()
            return self._memory

    def _hit_texts(self, payload: object) -> list[str]:
        return [item.memory for item in self._hit_models(payload) if item.memory]

    def _hit_models(self, payload: object) -> list[MemoryHit]:
        rows = payload.get("results", payload) if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            return []
        hits: list[MemoryHit] = []
        for row in rows:
            if isinstance(row, dict):
                text = row.get("memory")
                if not text:
                    continue
                score = row.get("score")
                hits.append(
                    MemoryHit(
                        id=str(row["id"]) if row.get("id") is not None else None,
                        memory=str(text),
                        score=float(score) if isinstance(score, (int, float)) else None,
                    )
                )
                continue
            text = getattr(row, "memory", None)
            if not text:
                continue
            score = getattr(row, "score", None)
            ident = getattr(row, "id", None)
            hits.append(
                MemoryHit(
                    id=str(ident) if ident is not None else None,
                    memory=str(text),
                    score=float(score) if isinstance(score, (int, float)) else None,
                )
            )
        return hits

    def _search_filters(
        self,
        user_id: str | None,
        conversation_id: str | None,
        agent_id: str | None,
        *,
        include_run: bool,
    ) -> dict[str, str]:
        scope = resolve_scope(user_id, conversation_id, agent_id)
        filters = {"user_id": scope["user_id"]}
        if "agent_id" in scope:
            filters["agent_id"] = scope["agent_id"]
        if include_run and "run_id" in scope:
            filters["run_id"] = scope["run_id"]
        return filters

    def _search_sync(
        self,
        query: str,
        *,
        user_id: str | None,
        conversation_id: str | None,
        agent_id: str | None,
        include_run: bool,
        top_k: int,
        flags: RuntimeFlags | None = None,
    ) -> object:
        memory = self.get_memory(flags)
        if memory is None:
            return {"results": []}
        filters = self._search_filters(user_id, conversation_id, agent_id, include_run=include_run)
        with self._ops_lock:
            self._bind_identity(memory, (user_id or "").strip() or None)
            return memory.search(query, top_k=top_k, filters=filters)

    def _add_sync(
        self,
        messages: list[dict],
        *,
        user_id: str | None,
        conversation_id: str | None,
        agent_id: str | None,
        flags: RuntimeFlags | None = None,
    ) -> object:
        memory = self.get_memory(flags)
        if memory is None:
            return {"results": []}
        scope = resolve_scope(user_id, conversation_id, agent_id)
        with self._ops_lock:
            self._bind_identity(memory, (user_id or "").strip() or None)
            return memory.add(
                messages,
                user_id=scope.get("user_id"),
                agent_id=scope.get("agent_id"),
                run_id=scope.get("run_id"),
            )

    def _bind_identity(self, memory: object, identity_id: str | None) -> None:
        llm = getattr(memory, "llm", None)
        if isinstance(llm, RouterLLM):
            llm.identity_id = identity_id

    def _record_user_id(self, record: object) -> str | None:
        if isinstance(record, dict):
            raw = record.get("user_id")
            if isinstance(raw, str) and raw.strip():
                return raw.strip()
            meta = record.get("metadata")
            if isinstance(meta, dict):
                nested = meta.get("user_id")
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()
            return None
        raw = getattr(record, "user_id", None)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
        return None

    def _get_sync(self, memory_id: str, flags: RuntimeFlags | None = None) -> object:
        memory = self.get_memory(flags)
        if memory is None:
            raise MemoryConfigError("Memory is disabled.")
        getter = getattr(memory, "get", None)
        if not callable(getter):
            raise ValueError("memory not found")
        with self._ops_lock:
            try:
                record = getter(memory_id)
            except ValueError:
                raise
            except Exception as exc:
                raise ValueError("memory not found") from exc
        if record is None:
            raise ValueError("memory not found")
        return record

    def _delete_sync(self, memory_id: str, flags: RuntimeFlags | None = None) -> None:
        memory = self.get_memory(flags)
        if memory is None:
            raise MemoryConfigError("Memory is disabled.")
        with self._ops_lock:
            memory.delete(memory_id)

    async def attach(
        self,
        messages: list[ChatMessage],
        flags: RuntimeFlags,
        *,
        user_id: str | None = None,
        conversation_id: str | None = None,
        agent_id: str | None = None,
    ) -> tuple[list[ChatMessage], int | None]:
        if not flags.memory:
            return list(messages), None
        query = _latest_user_text(messages)
        if not query:
            return list(messages), 0
        try:
            payload = await asyncio.to_thread(
                self._search_sync,
                query,
                user_id=user_id,
                conversation_id=conversation_id,
                agent_id=agent_id,
                include_run=False,
                top_k=_SEARCH_TOP_K,
                flags=flags,
            )
        except Exception:
            logger.exception("Mem0 search failed")
            return list(messages), 0
        memories = self._hit_texts(payload)
        return inject_memories(messages, memories), len(memories)

    def _turn_payload(self, messages: list[ChatMessage], assistant: str) -> list[dict[str, str]]:
        payload: list[dict[str, str]] = []
        last_user = _latest_user_text(messages)
        if last_user:
            payload.append({"role": "user", "content": last_user})
        if assistant.strip():
            payload.append({"role": "assistant", "content": assistant.strip()})
        return payload

    def schedule_record(
        self,
        messages: list[ChatMessage],
        assistant: str,
        flags: RuntimeFlags,
        *,
        user_id: str | None = None,
        conversation_id: str | None = None,
        agent_id: str | None = None,
    ) -> None:
        if not flags.memory or not self._accepting:
            return
        payload = self._turn_payload(messages, assistant)
        if len(payload) < 2:
            return

        async def _run() -> None:
            try:
                await asyncio.to_thread(
                    self._add_sync,
                    payload,
                    user_id=user_id,
                    conversation_id=conversation_id,
                    agent_id=agent_id,
                    flags=flags,
                )
            except Exception:
                logger.exception("Mem0 add failed")

        try:
            task = asyncio.get_running_loop().create_task(_run())
            self._background.add(task)
            task.add_done_callback(self._background.discard)
        except RuntimeError:
            try:
                self._add_sync(
                    payload,
                    user_id=user_id,
                    conversation_id=conversation_id,
                    agent_id=agent_id,
                    flags=flags,
                )
            except Exception:
                logger.exception("Mem0 add failed")

    async def search(
        self,
        query: str,
        *,
        user_id: str | None = None,
        conversation_id: str | None = None,
        agent_id: str | None = None,
        top_k: int = _SEARCH_TOP_K,
    ) -> list[MemoryHit]:
        payload = await asyncio.to_thread(
            self._search_sync,
            query,
            user_id=user_id,
            conversation_id=conversation_id,
            agent_id=agent_id,
            include_run=True,
            top_k=top_k,
            flags=None,
        )
        return self._hit_models(payload)

    async def add(
        self,
        messages: list[ChatMessage],
        *,
        user_id: str | None = None,
        conversation_id: str | None = None,
        agent_id: str | None = None,
    ) -> object:
        payload = [message.model_dump() for message in messages]
        return await asyncio.to_thread(
            self._add_sync,
            payload,
            user_id=user_id,
            conversation_id=conversation_id,
            agent_id=agent_id,
            flags=None,
        )

    async def delete(self, memory_id: str, *, user_id: str | None = None) -> None:
        owner = resolve_scope(user_id, None, None)["user_id"]
        record = await asyncio.to_thread(self._get_sync, memory_id, None)
        if self._record_user_id(record) != owner:
            raise ValueError("memory not found")
        await asyncio.to_thread(self._delete_sync, memory_id, None)

    async def drain(self, timeout: float = 5.0) -> None:
        self._accepting = False
        tasks = list(self._background)
        if not tasks:
            return
        _done, pending = await asyncio.wait(tasks, timeout=timeout)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
