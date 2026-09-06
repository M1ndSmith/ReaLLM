from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
import litellm
from litellm import completion_cost, cost_per_token, token_counter

from app.schemas import BudgetInfo, ChatMessage, UsageInfo

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_ROOT = Path(__file__).resolve().parent.parent
_STATE_PATH = _ROOT / "data" / "budget-state.json"
_DEFAULT_MAX_OUTPUT_TOKENS = 2048
_BUDGET_KEY_PREFIX = "realmm:budget:"
_REDIS_TTL_SECONDS = 3 * 24 * 3600
_lock = threading.Lock()
logger = logging.getLogger(__name__)

_redis_client: Any = None
_redis_unavailable = False


class InputTooLargeError(ValueError):
    """Raised when the prompt exceeds MAX_INPUT_TOKENS."""


class BudgetExceededError(ValueError):
    """Raised when the daily token or USD budget would be exceeded."""


def _optional_int(name: str) -> int | None:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _optional_float(name: str) -> float | None:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def max_input_tokens() -> int | None:
    return _optional_int("MAX_INPUT_TOKENS")


def max_output_tokens() -> int:
    value = _optional_int("MAX_OUTPUT_TOKENS")
    return _DEFAULT_MAX_OUTPUT_TOKENS if value is None else value


def daily_token_budget() -> int | None:
    return _optional_int("DAILY_TOKEN_BUDGET")


def daily_usd_budget() -> float | None:
    return _optional_float("DAILY_USD_BUDGET")


def _clean_usd(value: object) -> float | None:
    if not isinstance(value, (int, float)):
        return None
    return round(float(value), 8)


def _utc_day() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _empty_state(day: str) -> dict:
    return {"day": day, "tokens": 0, "usd": 0.0}


def _coerce_state(day: str, tokens: object, usd: object) -> dict:
    try:
        tokens_i = int(float(tokens))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        tokens_i = 0
    try:
        usd_f = float(usd)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        usd_f = 0.0
    return {"day": day, "tokens": max(0, tokens_i), "usd": max(0.0, usd_f)}


def redis_url() -> str | None:
    url = (os.getenv("REDIS_URL") or "").strip()
    return url or None


def _get_redis():
    global _redis_client, _redis_unavailable
    if _redis_unavailable:
        return None
    url = redis_url()
    if not url:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        import redis as redis_lib
    except ImportError:
        logger.warning("REDIS_URL is set but the redis package is missing; daily budget uses %s", _STATE_PATH)
        _redis_unavailable = True
        return None
    try:
        client = redis_lib.Redis.from_url(url, decode_responses=True)
        client.ping()
    except Exception:
        logger.warning("REDIS_URL is set but Redis is unreachable; daily budget uses %s", _STATE_PATH)
        _redis_unavailable = True
        return None
    _redis_client = client
    return _redis_client


def ledger_backend() -> str:
    return "redis" if _get_redis() is not None else "file"


def _budget_key(day: str) -> str:
    return f"{_BUDGET_KEY_PREFIX}{day}"


def _load_file_state(day: str) -> dict:
    if not _STATE_PATH.is_file():
        return _empty_state(day)
    try:
        data = json.loads(_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty_state(day)
    if not isinstance(data, dict) or data.get("day") != day:
        return _empty_state(day)
    return _coerce_state(day, data.get("tokens", 0), data.get("usd", 0.0))


def _load_redis_state(client: Any, day: str) -> dict:
    data = client.hgetall(_budget_key(day))
    if not isinstance(data, dict) or not data:
        return _empty_state(day)
    return _coerce_state(day, data.get("tokens", 0), data.get("usd", 0.0))


def _load_state() -> dict:
    day = _utc_day()
    client = _get_redis()
    if client is not None:
        try:
            return _load_redis_state(client, day)
        except Exception:
            logger.warning("Redis budget read failed; using file ledger", exc_info=True)
    return _load_file_state(day)


def _save_file_state(state: dict) -> None:
    _STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = _STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    tmp.replace(_STATE_PATH)


def _record_redis(client: Any, add_tokens: int, add_usd: float) -> None:
    key = _budget_key(_utc_day())
    pipe = client.pipeline()
    if add_tokens:
        pipe.hincrby(key, "tokens", add_tokens)
    if add_usd:
        pipe.hincrbyfloat(key, "usd", add_usd)
    pipe.expire(key, _REDIS_TTL_SECONDS)
    pipe.execute()


def model_priced(model: str) -> bool:
    costs = getattr(litellm, "model_cost", None) or {}
    if not costs:
        return False
    candidates = [model]
    if "/" in model:
        rest = model.split("/", 1)[1]
        candidates.append(rest)
        candidates.append(model.split("/")[-1])
    for name in candidates:
        info = costs.get(name)
        if not isinstance(info, dict):
            continue
        inp = info.get("input_cost_per_token")
        out = info.get("output_cost_per_token")
        if isinstance(inp, (int, float)) and inp > 0:
            return True
        if isinstance(out, (int, float)) and out > 0:
            return True
    return False


def token_count(model: str, messages: list[ChatMessage] | list[dict]) -> int:
    payload = []
    for message in messages:
        if isinstance(message, ChatMessage):
            payload.append(message.model_dump())
        else:
            payload.append(message)
    try:
        return int(token_counter(model=model, messages=payload))
    except Exception:
        text = " ".join(str(item.get("content", "") if isinstance(item, dict) else item.content) for item in messages)
        return max(1, len(text) // 4)


def token_count_text(model: str, text: str) -> int:
    if not text:
        return 0
    try:
        return int(token_counter(model=model, text=text))
    except Exception:
        return max(1, len(text) // 4)


def estimated_input_usd(model: str, prompt_tokens: int) -> float | None:
    if not model_priced(model) or prompt_tokens < 0:
        return None
    try:
        prompt_cost, _completion_cost = cost_per_token(
            model=model, prompt_tokens=prompt_tokens, completion_tokens=0
        )
    except Exception:
        return None
    if prompt_cost is None:
        return None
    return _clean_usd(prompt_cost)


def completion_usd(response: object, model: str) -> float | None:
    hidden = getattr(response, "_hidden_params", None)
    hidden_cost = None
    if isinstance(hidden, dict):
        hidden_cost = hidden.get("response_cost")
    elif hidden is not None:
        dumped = getattr(hidden, "model_dump", None)
        if callable(dumped):
            data = dumped()
            if isinstance(data, dict):
                hidden_cost = data.get("response_cost")

    if model_priced(model):
        try:
            cost = completion_cost(completion_response=response)
            if isinstance(cost, (int, float)):
                return _clean_usd(cost)
        except Exception:
            pass
        if isinstance(hidden_cost, (int, float)):
            return _clean_usd(hidden_cost)
        return None

    if isinstance(hidden_cost, (int, float)) and hidden_cost > 0:
        return _clean_usd(hidden_cost)
    return None


def usd_from_tokens(model: str, prompt_tokens: int, completion_tokens: int) -> float | None:
    if not model_priced(model):
        return None
    try:
        prompt_cost, completion_cost_usd = cost_per_token(
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
    except Exception:
        return None
    if prompt_cost is None or completion_cost_usd is None:
        return None
    return _clean_usd(float(prompt_cost) + float(completion_cost_usd))


def assert_allowed(model: str, estimated_tokens: int) -> None:
    input_limit = max_input_tokens()
    if input_limit is not None and estimated_tokens > input_limit:
        raise InputTooLargeError(
            f"Prompt is {estimated_tokens} tokens; MAX_INPUT_TOKENS is {input_limit}."
        )

    with _lock:
        state = _load_state()
        token_cap = daily_token_budget()
        if token_cap is not None and state["tokens"] + estimated_tokens > token_cap:
            remaining = max(0, token_cap - state["tokens"])
            raise BudgetExceededError(
                f"Daily token budget exceeded. {state['tokens']} used, {remaining} left, "
                f"prompt is {estimated_tokens} tokens (cap {token_cap})."
            )
        usd_cap = daily_usd_budget()
        projected = estimated_input_usd(model, estimated_tokens)
        if usd_cap is not None and projected is not None and state["usd"] + projected > usd_cap:
            remaining = max(0.0, usd_cap - state["usd"])
            raise BudgetExceededError(
                f"Daily USD budget exceeded. ${state['usd']:.6f} used, ${remaining:.6f} left, "
                f"prompt estimate is ${projected:.6f} (cap ${usd_cap:.6f})."
            )


def record_usage(*, tokens: int | None, usd: float | None, cached: bool) -> None:
    if cached:
        return
    add_tokens = max(0, int(tokens or 0))
    add_usd = float(usd) if isinstance(usd, (int, float)) and usd > 0 else 0.0
    if add_tokens == 0 and add_usd == 0.0:
        return
    client = _get_redis()
    if client is not None:
        try:
            _record_redis(client, add_tokens, add_usd)
            return
        except Exception:
            logger.warning("Redis budget write failed; using file ledger", exc_info=True)
    with _lock:
        state = _load_file_state(_utc_day())
        state["tokens"] += add_tokens
        state["usd"] += add_usd
        _save_file_state(state)


def attach_cost(usage: UsageInfo | None, cost: float | None) -> UsageInfo | None:
    if usage is None and cost is None:
        return None
    if usage is None:
        return UsageInfo(cost_usd=cost)
    return usage.model_copy(update={"cost_usd": cost})


def usage_from_counts(
    model: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    *,
    cost: float | None = None,
) -> UsageInfo:
    total = None
    if prompt_tokens is not None and completion_tokens is not None:
        total = prompt_tokens + completion_tokens
    elif prompt_tokens is not None:
        total = prompt_tokens
    elif completion_tokens is not None:
        total = completion_tokens
    if cost is None and prompt_tokens is not None and completion_tokens is not None:
        cost = usd_from_tokens(model, prompt_tokens, completion_tokens)
    return UsageInfo(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total,
        cost_usd=cost,
    )


def budget_status() -> BudgetInfo:
    with _lock:
        state = _load_state()
    return BudgetInfo(
        daily_tokens=state["tokens"],
        daily_token_limit=daily_token_budget(),
        daily_usd=round(state["usd"], 8),
        daily_usd_limit=daily_usd_budget(),
        max_input_tokens=max_input_tokens(),
        max_output_tokens=max_output_tokens(),
        ledger=ledger_backend(),
    )
