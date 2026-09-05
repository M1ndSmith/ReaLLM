from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from pathlib import Path

from dotenv import load_dotenv

from app.schemas import ChatMessage, MemoryHit, MemoryInfo

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_ROOT = Path(__file__).resolve().parent.parent
_MEM0_DIR = _ROOT / "data" / "mem0"
_QDRANT_PATH = _MEM0_DIR / "qdrant"
_HISTORY_DB = _MEM0_DIR / "history.db"
_DEFAULT_USER_ID = "local"
_FASTEMBED_MODEL = "BAAI/bge-small-en-v1.5"
_FASTEMBED_DIMS = 384
_OPENAI_EMBED_MODEL = "text-embedding-3-small"
_OPENAI_EMBED_DIMS = 1536
_EXTRACT_MAX_TOKENS = 512
_SEARCH_TOP_K = 5

os.environ.setdefault("MEM0_DIR", str(_MEM0_DIR))
os.environ.setdefault("MEM0_TELEMETRY", "False")

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_ops_lock = threading.Lock()
_memory = None
_background: set[asyncio.Task] = set()


class MemoryConfigError(ValueError):
    """Raised when Mem0 cannot be configured (missing model, embedder, or keys)."""


class RouterLLM:
    """Mem0-compatible LLM that calls the existing LiteLLM Router."""

    def __init__(self, model: str, *, temperature: float = 0.1, max_tokens: int = _EXTRACT_MAX_TOKENS):
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
        from app.budget import completion_usd, record_usage
        from app.reliability import chat_fallback_ids, get_router

        model = self.config.model
        params: dict = {
            "model": model,
            "messages": messages,
            "temperature": self.config.temperature,
            "top_p": self.config.top_p,
            "max_tokens": self.config.max_tokens,
            "caching": False,
        }
        fallbacks = chat_fallback_ids(model)
        if fallbacks:
            params["fallbacks"] = fallbacks
        if response_format is not None:
            params["response_format"] = response_format
        if tools:
            params["tools"] = tools
            params["tool_choice"] = tool_choice
        params.update(kwargs)

        router = get_router()
        response = router.completion(**params)
        usage = getattr(response, "usage", None)
        tokens = getattr(usage, "total_tokens", None) if usage is not None else None
        hidden = getattr(response, "_hidden_params", None)
        cached = isinstance(hidden, dict) and hidden.get("cache_hit") is True
        record_usage(tokens=tokens, usd=completion_usd(response, model), cached=cached)
        return _parse_llm_response(response, tools)


def memory_enabled() -> bool:
    raw = (os.getenv("MEMORY") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _env_flag(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _embedder_provider() -> str:
    raw = _env_flag("MEMORY_EMBEDDER").lower() or "fastembed"
    if raw in {"fastembed", "openai"}:
        return raw
    raise MemoryConfigError("MEMORY_EMBEDDER must be fastembed or openai.")


def _llm_model_id() -> str | None:
    requested = _env_flag("MEMORY_LLM_MODEL")
    if requested:
        from app.llm import UnknownModelError, resolve_model

        try:
            return resolve_model(requested)
        except UnknownModelError as exc:
            raise MemoryConfigError(str(exc)) from exc
    from app.llm import list_available_models
    from app.reliability import is_chat_model

    for item in list_available_models():
        if is_chat_model(item.id):
            return item.id
    return None


def memory_status() -> MemoryInfo:
    if not memory_enabled():
        return MemoryInfo(enabled=False)
    try:
        embedder = _embedder_provider()
    except MemoryConfigError:
        embedder = _env_flag("MEMORY_EMBEDDER") or "fastembed"
    try:
        llm_id = _llm_model_id()
    except MemoryConfigError:
        llm_id = _env_flag("MEMORY_LLM_MODEL") or None
    return MemoryInfo(
        enabled=True,
        llm=llm_id,
        embedder=embedder,
        vector="qdrant",
    )


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


def _search_filters(
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


def _latest_user_text(messages: list[ChatMessage] | list[dict]) -> str:
    for message in reversed(messages):
        if isinstance(message, ChatMessage):
            role, content = message.role, message.content
        else:
            role, content = str(message.get("role", "")), str(message.get("content") or "")
        if role == "user" and content.strip():
            return content.strip()
    return ""


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


def _build_memory():
    model = _llm_model_id()
    if not model:
        raise MemoryConfigError("Memory needs a chat model. Set MEMORY_LLM_MODEL or add a PROVIDER_API_KEY.")

    embedder = _embedder_provider()
    if embedder == "openai":
        if not _env_flag("OPENAI_API_KEY"):
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

    _MEM0_DIR.mkdir(parents=True, exist_ok=True)
    _QDRANT_PATH.mkdir(parents=True, exist_ok=True)

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
                    "path": str(_QDRANT_PATH),
                    "on_disk": True,
                },
            },
            "history_db_path": str(_HISTORY_DB),
        }
    )
    memory.llm = RouterLLM(model)
    return memory


def get_memory():
    global _memory
    if not memory_enabled():
        return None
    if _memory is not None:
        return _memory
    with _lock:
        if _memory is not None:
            return _memory
        _memory = _build_memory()
        return _memory


def _hit_texts(payload: object) -> list[str]:
    return [item.memory for item in _hit_models(payload) if item.memory]


def _hit_models(payload: object) -> list[MemoryHit]:
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


def _search_sync(
    query: str,
    *,
    user_id: str | None,
    conversation_id: str | None,
    agent_id: str | None,
    include_run: bool,
    top_k: int,
) -> object:
    memory = get_memory()
    if memory is None:
        return {"results": []}
    filters = _search_filters(user_id, conversation_id, agent_id, include_run=include_run)
    with _ops_lock:
        return memory.search(query, top_k=top_k, filters=filters)


def _add_sync(
    messages: list[dict],
    *,
    user_id: str | None,
    conversation_id: str | None,
    agent_id: str | None,
) -> object:
    memory = get_memory()
    if memory is None:
        return {"results": []}
    scope = resolve_scope(user_id, conversation_id, agent_id)
    with _ops_lock:
        return memory.add(
            messages,
            user_id=scope.get("user_id"),
            agent_id=scope.get("agent_id"),
            run_id=scope.get("run_id"),
        )


def _delete_sync(memory_id: str) -> None:
    memory = get_memory()
    if memory is None:
        raise MemoryConfigError("Memory is disabled.")
    with _ops_lock:
        memory.delete(memory_id)


async def attach_memories(
    messages: list[ChatMessage],
    *,
    user_id: str | None = None,
    conversation_id: str | None = None,
    agent_id: str | None = None,
) -> tuple[list[ChatMessage], int | None]:
    if not memory_enabled():
        return list(messages), None
    query = _latest_user_text(messages)
    if not query:
        return list(messages), 0
    try:
        payload = await asyncio.to_thread(
            _search_sync,
            query,
            user_id=user_id,
            conversation_id=conversation_id,
            agent_id=agent_id,
            include_run=False,
            top_k=_SEARCH_TOP_K,
        )
    except Exception:
        logger.exception("Mem0 search failed")
        return list(messages), 0
    memories = _hit_texts(payload)
    return inject_memories(messages, memories), len(memories)


def _turn_payload(messages: list[ChatMessage], assistant: str) -> list[dict[str, str]]:
    payload: list[dict[str, str]] = []
    last_user = _latest_user_text(messages)
    if last_user:
        payload.append({"role": "user", "content": last_user})
    if assistant.strip():
        payload.append({"role": "assistant", "content": assistant.strip()})
    return payload


def record_turn(
    messages: list[ChatMessage],
    assistant: str,
    *,
    user_id: str | None = None,
    conversation_id: str | None = None,
    agent_id: str | None = None,
) -> None:
    if not memory_enabled():
        return
    payload = _turn_payload(messages, assistant)
    if len(payload) < 2:
        return

    async def _run() -> None:
        try:
            await asyncio.to_thread(
                _add_sync,
                payload,
                user_id=user_id,
                conversation_id=conversation_id,
                agent_id=agent_id,
            )
        except Exception:
            logger.exception("Mem0 add failed")

    try:
        task = asyncio.get_running_loop().create_task(_run())
        _background.add(task)
        task.add_done_callback(_background.discard)
    except RuntimeError:
        try:
            _add_sync(
                payload,
                user_id=user_id,
                conversation_id=conversation_id,
                agent_id=agent_id,
            )
        except Exception:
            logger.exception("Mem0 add failed")


async def search_memories(
    query: str,
    *,
    user_id: str | None = None,
    conversation_id: str | None = None,
    agent_id: str | None = None,
    top_k: int = _SEARCH_TOP_K,
) -> list[MemoryHit]:
    payload = await asyncio.to_thread(
        _search_sync,
        query,
        user_id=user_id,
        conversation_id=conversation_id,
        agent_id=agent_id,
        include_run=True,
        top_k=top_k,
    )
    return _hit_models(payload)


async def add_memories(
    messages: list[ChatMessage],
    *,
    user_id: str | None = None,
    conversation_id: str | None = None,
    agent_id: str | None = None,
) -> object:
    payload = [message.model_dump() for message in messages]
    return await asyncio.to_thread(
        _add_sync,
        payload,
        user_id=user_id,
        conversation_id=conversation_id,
        agent_id=agent_id,
    )


async def delete_memory(memory_id: str) -> None:
    await asyncio.to_thread(_delete_sync, memory_id)
