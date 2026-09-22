from __future__ import annotations

import json
import logging
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import litellm
from litellm import completion_cost, cost_per_token, token_counter

from app.application.errors import BudgetExceededError, IdentityRateLimitError, InputTooLargeError
from app.application.models import IdentityQuotas
from app.infrastructure.redis_health import RedisHealth
from app.schemas import BudgetInfo, ChatMessage, UsageInfo
from app.settings import GatewaySettings

_BUDGET_KEY_PREFIX = "realmm:budget:"
_RPM_KEY_PREFIX = "realmm:rpm:"
_REDIS_TTL_SECONDS = 3 * 24 * 3600
_RPM_WINDOW_SECONDS = 60
logger = logging.getLogger(__name__)

_RESERVE_LUA = """
local gkey = KEYS[1]
local ikey = KEYS[2]
local add_tokens = tonumber(ARGV[1])
local add_usd = tonumber(ARGV[2])
local g_token_cap = tonumber(ARGV[3])
local g_usd_cap = tonumber(ARGV[4])
local i_token_cap = tonumber(ARGV[5])
local i_usd_cap = tonumber(ARGV[6])
local ttl = tonumber(ARGV[7])

local function over(key, token_cap, usd_cap)
  if token_cap >= 0 then
    local tokens = tonumber(redis.call('HGET', key, 'tokens') or '0')
    if tokens + add_tokens > token_cap then return 1 end
  end
  if usd_cap >= 0 and add_usd > 0 then
    local usd = tonumber(redis.call('HGET', key, 'usd') or '0')
    if usd + add_usd > usd_cap then return 2 end
  end
  return 0
end

local g = over(gkey, g_token_cap, g_usd_cap)
if g ~= 0 then return g end
if ikey ~= '' then
  local i = over(ikey, i_token_cap, i_usd_cap)
  if i == 1 then return 3 end
  if i == 2 then return 4 end
end
if add_tokens ~= 0 then
  redis.call('HINCRBY', gkey, 'tokens', add_tokens)
end
if add_usd ~= 0 then
  redis.call('HINCRBYFLOAT', gkey, 'usd', add_usd)
end
redis.call('EXPIRE', gkey, ttl)
if ikey ~= '' then
  if add_tokens ~= 0 then redis.call('HINCRBY', ikey, 'tokens', add_tokens) end
  if add_usd ~= 0 then redis.call('HINCRBYFLOAT', ikey, 'usd', add_usd) end
  redis.call('EXPIRE', ikey, ttl)
end
return 0
"""


@dataclass(frozen=True)
class _Reservation:
    tokens: int
    usd: float
    identity_id: str | None


def _clean_usd(value: object) -> float | None:
    if not isinstance(value, (int, float)):
        return None
    return round(float(value), 8)


def _utc_day() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _empty_state(day: str) -> dict:
    return {"day": day, "tokens": 0, "usd": 0.0, "identities": {}}


def _coerce_identities(raw: object) -> dict[str, dict]:
    if not isinstance(raw, dict):
        return {}
    identities: dict[str, dict] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not isinstance(value, dict):
            continue
        identities[key] = {
            "tokens": max(0, _as_int(value.get("tokens", 0))),
            "usd": max(0.0, _as_float(value.get("usd", 0.0))),
        }
    return identities


def _as_int(value: object) -> int:
    try:
        return int(float(value))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0


def _as_float(value: object) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def _coerce_state(day: str, tokens: object, usd: object, identities: object = None) -> dict:
    return {
        "day": day,
        "tokens": max(0, _as_int(tokens)),
        "usd": max(0.0, _as_float(usd)),
        "identities": _coerce_identities(identities),
    }


def _identity_slug(identity_id: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in identity_id.strip())
    return cleaned[:64] or "unknown"


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


class BudgetRuntime:
    def __init__(self, settings: GatewaySettings, *, state_path: Path, redis_health: RedisHealth | None = None):
        self._settings = settings
        self._state_path = state_path
        self._redis_health = redis_health
        self._lock = threading.Lock()
        self._redis_client: Any = None
        self._redis_import_failed = False
        self._rpm_hits: dict[str, list[float]] = {}
        self._reservations: dict[str, _Reservation] = {}

    def max_input_tokens(self) -> int | None:
        return self._settings.max_input_tokens

    def max_output_tokens(self) -> int:
        return self._settings.max_output_tokens

    def daily_token_budget(self) -> int | None:
        return self._settings.daily_token_budget

    def daily_usd_budget(self) -> float | None:
        return self._settings.daily_usd_budget

    def redis_url(self) -> str | None:
        return self._settings.redis_url_value()

    def close(self) -> None:
        client = self._redis_client
        self._redis_client = None
        if client is None:
            return
        closer = getattr(client, "close", None)
        if callable(closer):
            try:
                closer()
            except Exception:
                logger.debug("Redis client close failed", exc_info=True)

    def _get_redis(self):
        if self._redis_import_failed:
            return None
        url = self.redis_url()
        if not url:
            return None
        if self._redis_health is not None and not self._redis_health.reachable():
            return None
        if self._redis_client is not None:
            try:
                self._redis_client.ping()
                return self._redis_client
            except Exception:
                logger.warning("Redis budget ping failed; using file ledger", exc_info=True)
                self._redis_client = None
        try:
            import redis as redis_lib
        except ImportError:
            logger.warning(
                "REDIS_URL is set but the redis package is missing; daily budget uses %s",
                self._state_path,
            )
            self._redis_import_failed = True
            return None
        try:
            client = redis_lib.Redis.from_url(url, decode_responses=True)
            client.ping()
        except Exception:
            logger.warning("REDIS_URL is set but Redis is unreachable; daily budget uses %s", self._state_path)
            return None
        self._redis_client = client
        return self._redis_client

    def ledger_backend(self) -> str:
        return "redis" if self._get_redis() is not None else "file"

    def _budget_key(self, day: str) -> str:
        return f"{_BUDGET_KEY_PREFIX}{day}"

    def _identity_budget_key(self, day: str, identity_id: str) -> str:
        return f"{_BUDGET_KEY_PREFIX}{day}:id:{_identity_slug(identity_id)}"

    def _load_file_state(self, day: str) -> dict:
        if not self._state_path.is_file():
            return _empty_state(day)
        try:
            data = json.loads(self._state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return _empty_state(day)
        if not isinstance(data, dict) or data.get("day") != day:
            return _empty_state(day)
        return _coerce_state(day, data.get("tokens", 0), data.get("usd", 0.0), data.get("identities"))

    def _load_redis_state(self, client: Any, day: str) -> dict:
        data = client.hgetall(self._budget_key(day))
        if not isinstance(data, dict) or not data:
            return _empty_state(day)
        return _coerce_state(day, data.get("tokens", 0), data.get("usd", 0.0))

    def _load_state(self) -> dict:
        day = _utc_day()
        client = self._get_redis()
        if client is not None:
            try:
                return self._load_redis_state(client, day)
            except Exception:
                logger.warning("Redis budget read failed; using file ledger", exc_info=True)
        return self._load_file_state(day)

    def _save_file_state(self, state: dict) -> None:
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        tmp.replace(self._state_path)

    def _record_redis(self, client: Any, add_tokens: int, add_usd: float, *, key: str | None = None) -> None:
        redis_key = key or self._budget_key(_utc_day())
        pipe = client.pipeline()
        if add_tokens:
            pipe.hincrby(redis_key, "tokens", add_tokens)
        if add_usd:
            pipe.hincrbyfloat(redis_key, "usd", add_usd)
        pipe.expire(redis_key, _REDIS_TTL_SECONDS)
        pipe.execute()

    def _load_identity_state(self, identity_id: str) -> dict:
        day = _utc_day()
        client = self._get_redis()
        if client is not None:
            try:
                data = client.hgetall(self._identity_budget_key(day, identity_id))
                if isinstance(data, dict) and data:
                    return _coerce_state(day, data.get("tokens", 0), data.get("usd", 0.0))
            except Exception:
                logger.warning("Redis identity budget read failed; using file ledger", exc_info=True)
        file_state = self._load_file_state(day)
        bucket = (file_state.get("identities") or {}).get(identity_id) or {}
        return _coerce_state(day, bucket.get("tokens", 0), bucket.get("usd", 0.0))

    def token_count(self, model: str, messages: list[ChatMessage] | list[dict]) -> int:
        payload = []
        for message in messages:
            if isinstance(message, ChatMessage):
                payload.append(message.model_dump())
            else:
                payload.append(message)
        try:
            return int(token_counter(model=model, messages=payload))
        except Exception:
            text = " ".join(
                str(item.get("content", "") if isinstance(item, dict) else item.content) for item in messages
            )
            return max(1, len(text) // 4)

    def token_count_text(self, model: str, text: str) -> int:
        if not text:
            return 0
        try:
            return int(token_counter(model=model, text=text))
        except Exception:
            return max(1, len(text) // 4)

    def estimated_input_usd(self, model: str, prompt_tokens: int) -> float | None:
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

    def completion_usd(self, response: object, model: str) -> float | None:
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

    def usd_from_tokens(self, model: str, prompt_tokens: int, completion_tokens: int) -> float | None:
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

    def assert_allowed(
        self,
        model: str,
        estimated_tokens: int,
        *,
        identity_id: str | None = None,
        quotas: IdentityQuotas | None = None,
    ) -> None:
        input_limit = self.max_input_tokens()
        if input_limit is not None and estimated_tokens > input_limit:
            raise InputTooLargeError(f"Prompt is {estimated_tokens} tokens; MAX_INPUT_TOKENS is {input_limit}.")

        with self._lock:
            state = self._load_state()
            token_cap = self.daily_token_budget()
            if token_cap is not None and state["tokens"] + estimated_tokens > token_cap:
                remaining = max(0, token_cap - state["tokens"])
                raise BudgetExceededError(
                    f"Daily token budget exceeded. {state['tokens']} used, {remaining} left, "
                    f"prompt is {estimated_tokens} tokens (cap {token_cap})."
                )
            usd_cap = self.daily_usd_budget()
            projected = self.estimated_input_usd(model, estimated_tokens)
            if usd_cap is not None and projected is not None and state["usd"] + projected > usd_cap:
                remaining = max(0.0, usd_cap - state["usd"])
                raise BudgetExceededError(
                    f"Daily USD budget exceeded. ${state['usd']:.6f} used, ${remaining:.6f} left, "
                    f"prompt estimate is ${projected:.6f} (cap ${usd_cap:.6f})."
                )
            if identity_id and quotas is not None:
                identity_state = self._load_identity_state(identity_id)
                ident_token_cap = quotas.daily_token_budget
                if ident_token_cap is not None and identity_state["tokens"] + estimated_tokens > ident_token_cap:
                    remaining = max(0, ident_token_cap - identity_state["tokens"])
                    raise BudgetExceededError(
                        f"Key '{identity_id}' daily token budget exceeded. {identity_state['tokens']} used, "
                        f"{remaining} left, prompt is {estimated_tokens} tokens (cap {ident_token_cap})."
                    )
                ident_usd_cap = quotas.daily_usd_budget
                if (
                    ident_usd_cap is not None
                    and projected is not None
                    and identity_state["usd"] + projected > ident_usd_cap
                ):
                    remaining = max(0.0, ident_usd_cap - identity_state["usd"])
                    raise BudgetExceededError(
                        f"Key '{identity_id}' daily USD budget exceeded. ${identity_state['usd']:.6f} used, "
                        f"${remaining:.6f} left, prompt estimate is ${projected:.6f} (cap ${ident_usd_cap:.6f})."
                    )

    def assert_rpm(self, identity_id: str | None, rpm_limit: int | None) -> None:
        if not identity_id or rpm_limit is None or rpm_limit < 1:
            return
        slug = _identity_slug(identity_id)
        client = self._get_redis()
        if client is not None:
            try:
                key = f"{_RPM_KEY_PREFIX}{slug}:{int(time.time()) // _RPM_WINDOW_SECONDS}"
                count = int(client.incr(key))
                client.expire(key, _RPM_WINDOW_SECONDS * 2)
                if count > rpm_limit:
                    raise IdentityRateLimitError(f"Key '{identity_id}' exceeded {rpm_limit} requests per minute.")
                return
            except IdentityRateLimitError:
                raise
            except Exception:
                logger.warning("Redis RPM check failed; using in-process window", exc_info=True)
        now = time.monotonic()
        with self._lock:
            hits = [stamp for stamp in self._rpm_hits.get(slug, []) if now - stamp < _RPM_WINDOW_SECONDS]
            if len(hits) >= rpm_limit:
                self._rpm_hits[slug] = hits
                raise IdentityRateLimitError(f"Key '{identity_id}' exceeded {rpm_limit} requests per minute.")
            hits.append(now)
            self._rpm_hits[slug] = hits

    def reserve(
        self,
        model: str,
        estimated_tokens: int,
        *,
        identity_id: str | None = None,
        quotas: IdentityQuotas | None = None,
    ) -> str:
        """Check the daily cap and commit the estimate before the provider call."""
        input_limit = self.max_input_tokens()
        if input_limit is not None and estimated_tokens > input_limit:
            raise InputTooLargeError(f"Prompt is {estimated_tokens} tokens; MAX_INPUT_TOKENS is {input_limit}.")
        projected = self.estimated_input_usd(model, estimated_tokens)
        add_tokens = max(0, int(estimated_tokens or 0))
        add_usd = float(projected) if isinstance(projected, (int, float)) and projected > 0 else 0.0
        client = self._get_redis()
        if client is not None:
            try:
                self._reserve_redis(client, model, estimated_tokens, add_tokens, add_usd, identity_id, quotas)
            except BudgetExceededError:
                raise
            except Exception:
                logger.warning("Redis budget reserve failed; using file ledger", exc_info=True)
            else:
                return self._store_reservation(add_tokens, add_usd, identity_id)
        with self._lock:
            state = self._load_file_state(_utc_day())
            identity_state = None
            if identity_id and quotas is not None:
                bucket = (state.get("identities") or {}).get(identity_id) or {}
                identity_state = _coerce_state(_utc_day(), bucket.get("tokens", 0), bucket.get("usd", 0.0))
            self._reject_caps(
                state,
                identity_state,
                estimated_tokens,
                projected,
                identity_id=identity_id,
                quotas=quotas,
            )
            self._bump_file_state(state, add_tokens, add_usd, identity_id)
            self._save_file_state(state)
            return self._store_reservation_unlocked(add_tokens, add_usd, identity_id)

    def release(self, reservation_id: str | None) -> None:
        if not reservation_id:
            return
        with self._lock:
            reservation = self._reservations.pop(reservation_id, None)
        if reservation is None:
            return
        self._apply_delta(-reservation.tokens, -reservation.usd, reservation.identity_id)

    def _store_reservation(self, tokens: int, usd: float, identity_id: str | None) -> str:
        with self._lock:
            return self._store_reservation_unlocked(tokens, usd, identity_id)

    def _store_reservation_unlocked(self, tokens: int, usd: float, identity_id: str | None) -> str:
        reservation_id = secrets.token_hex(8)
        self._reservations[reservation_id] = _Reservation(tokens=tokens, usd=usd, identity_id=identity_id)
        return reservation_id

    def _reserve_redis(
        self,
        client: Any,
        model: str,
        estimated_tokens: int,
        add_tokens: int,
        add_usd: float,
        identity_id: str | None,
        quotas: IdentityQuotas | None,
    ) -> None:
        day = _utc_day()
        identity_key = self._identity_budget_key(day, identity_id) if identity_id else ""
        ident_token_cap = quotas.daily_token_budget if identity_id and quotas is not None else None
        ident_usd_cap = quotas.daily_usd_budget if identity_id and quotas is not None else None
        code = int(
            client.eval(
                _RESERVE_LUA,
                2,
                self._budget_key(day),
                identity_key,
                add_tokens,
                add_usd,
                self.daily_token_budget() if self.daily_token_budget() is not None else -1,
                self.daily_usd_budget() if self.daily_usd_budget() is not None else -1,
                ident_token_cap if ident_token_cap is not None else -1,
                ident_usd_cap if ident_usd_cap is not None else -1,
                _REDIS_TTL_SECONDS,
            )
        )
        if code:
            self.assert_allowed(model, estimated_tokens, identity_id=identity_id, quotas=quotas)
            raise BudgetExceededError("Daily budget exceeded.")

    def _reject_caps(
        self,
        state: dict,
        identity_state: dict | None,
        estimated_tokens: int,
        projected: float | None,
        *,
        identity_id: str | None,
        quotas: IdentityQuotas | None,
    ) -> None:
        token_cap = self.daily_token_budget()
        if token_cap is not None and state["tokens"] + estimated_tokens > token_cap:
            remaining = max(0, token_cap - state["tokens"])
            raise BudgetExceededError(
                f"Daily token budget exceeded. {state['tokens']} used, {remaining} left, "
                f"prompt is {estimated_tokens} tokens (cap {token_cap})."
            )
        usd_cap = self.daily_usd_budget()
        if usd_cap is not None and projected is not None and state["usd"] + projected > usd_cap:
            remaining = max(0.0, usd_cap - state["usd"])
            raise BudgetExceededError(
                f"Daily USD budget exceeded. ${state['usd']:.6f} used, ${remaining:.6f} left, "
                f"prompt estimate is ${projected:.6f} (cap ${usd_cap:.6f})."
            )
        if not identity_id or quotas is None or identity_state is None:
            return
        ident_token_cap = quotas.daily_token_budget
        if ident_token_cap is not None and identity_state["tokens"] + estimated_tokens > ident_token_cap:
            remaining = max(0, ident_token_cap - identity_state["tokens"])
            raise BudgetExceededError(
                f"Key '{identity_id}' daily token budget exceeded. {identity_state['tokens']} used, "
                f"{remaining} left, prompt is {estimated_tokens} tokens (cap {ident_token_cap})."
            )
        ident_usd_cap = quotas.daily_usd_budget
        if ident_usd_cap is not None and projected is not None and identity_state["usd"] + projected > ident_usd_cap:
            remaining = max(0.0, ident_usd_cap - identity_state["usd"])
            raise BudgetExceededError(
                f"Key '{identity_id}' daily USD budget exceeded. ${identity_state['usd']:.6f} used, "
                f"${remaining:.6f} left, prompt estimate is ${projected:.6f} (cap ${ident_usd_cap:.6f})."
            )

    def _bump_file_state(self, state: dict, add_tokens: int, add_usd: float, identity_id: str | None) -> None:
        state["tokens"] = max(0, int(state["tokens"]) + int(add_tokens))
        state["usd"] = max(0.0, float(state["usd"]) + float(add_usd))
        if not identity_id:
            return
        identities = state.setdefault("identities", {})
        bucket = identities.setdefault(identity_id, {"tokens": 0, "usd": 0.0})
        bucket["tokens"] = max(0, int(bucket.get("tokens", 0) or 0) + int(add_tokens))
        bucket["usd"] = max(0.0, float(bucket.get("usd", 0.0) or 0.0) + float(add_usd))

    def _apply_delta(self, add_tokens: int, add_usd: float, identity_id: str | None) -> None:
        if add_tokens == 0 and add_usd == 0.0:
            return
        client = self._get_redis()
        if client is not None:
            try:
                self._record_redis(client, add_tokens, add_usd)
                if identity_id:
                    self._record_redis(
                        client,
                        add_tokens,
                        add_usd,
                        key=self._identity_budget_key(_utc_day(), identity_id),
                    )
                return
            except Exception:
                logger.warning("Redis budget write failed; using file ledger", exc_info=True)
        with self._lock:
            state = self._load_file_state(_utc_day())
            self._bump_file_state(state, add_tokens, add_usd, identity_id)
            self._save_file_state(state)

    def record_usage(
        self,
        *,
        tokens: int | None,
        usd: float | None,
        cached: bool,
        identity_id: str | None = None,
        reservation_id: str | None = None,
    ) -> None:
        reservation = None
        if reservation_id:
            with self._lock:
                reservation = self._reservations.pop(reservation_id, None)
        if cached:
            if reservation is not None:
                self._apply_delta(-reservation.tokens, -reservation.usd, reservation.identity_id)
            return
        add_tokens = max(0, int(tokens or 0))
        add_usd = float(usd) if isinstance(usd, (int, float)) and usd > 0 else 0.0
        if reservation is not None:
            add_tokens -= reservation.tokens
            add_usd -= reservation.usd
            identity_id = identity_id if identity_id is not None else reservation.identity_id
        self._apply_delta(add_tokens, add_usd, identity_id)

    def attach_cost(self, usage: UsageInfo | None, cost: float | None) -> UsageInfo | None:
        if usage is None and cost is None:
            return None
        if usage is None:
            return UsageInfo(cost_usd=cost)
        return usage.model_copy(update={"cost_usd": cost})

    def usage_from_counts(
        self,
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
            cost = self.usd_from_tokens(model, prompt_tokens, completion_tokens)
        return UsageInfo(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total,
            cost_usd=cost,
        )

    def status(self) -> BudgetInfo:
        with self._lock:
            state = self._load_state()
        return BudgetInfo(
            daily_tokens=state["tokens"],
            daily_token_limit=self.daily_token_budget(),
            daily_usd=round(state["usd"], 8),
            daily_usd_limit=self.daily_usd_budget(),
            max_input_tokens=self.max_input_tokens(),
            max_output_tokens=self.max_output_tokens(),
            ledger=self.ledger_backend(),
        )
