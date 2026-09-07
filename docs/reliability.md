# Retry, fallback, cache, and rate limits

Chat goes through LiteLLM's Router in [`app/infrastructure/router.py`](../app/infrastructure/router.py). You pick one model. The Router retries it, then falls back, caches, and caps RPM/TPM.

## Order of operations

1. Cache lookup (non-stream only)
2. RPM/TPM and parallel-request checks
3. Call the selected model
4. Retry on transient errors
5. Fall back only to the allowlist if it still fails

## Retry

`LITELLM_NUM_RETRIES` (default `2`) plus `retry_after=1` second. Extra attempts by error type:

| Error | Extra retries |
| --- | --- |
| Rate limit | 3 |
| Timeout | 2 |
| Internal server | 2 |
| Authentication | 0 |
| Bad request | 0 |

After `allowed_fails=2` failures, that deployment is cooled down for 60 seconds.

## Fallback

A Groq `gpt-oss-20b` failure must not silently answer with `allam-2-7b`. The Router does not dump the whole catalog.

`FALLBACKS`:

| Value | Policy |
| --- | --- |
| unset | Same-provider chat models only (skips `whisper` / `tts` / `orpheus` / `prompt-guard` / `llama-guard` and weak ids such as `compound`, `allam`, `safeguard`, `canopy`) |
| `0` / `off` / `none` | Retry the requested model only |
| comma-separated catalog ids | Explicit allowlist (those chat models, minus the one you asked for) |

JSON `POST /chat` sets `fallback_from` to the model you asked for when a different catalog model actually answered. Streaming may send a final SSE meta event with the same fields. Cache is not used on streams.

`GET /health` `reliability.fallback_policy` is `same-provider`, `allowlist`, or `retry-only`. `fallbacks` is that pool, not every chat id.

## Cache

On by default (`LITELLM_CACHE=1`). TTL is `LITELLM_CACHE_TTL` (default `120` seconds). The same non-stream model + messages returns `cached: true` on the next call until TTL. Streams pass `caching=False`.

## Redis

In-memory cache, RPM/TPM, cooldown, and the daily budget file are correct for one uvicorn worker only.

Set `REDIS_URL` as soon as you run more than one process (`--workers`). The Router then shares response cache and TPM/RPM/cooldown across instances. The app's daily ledger uses the same URL (see [budget](budget.md)).

On the host that is `redis://localhost:6379/0`. [`compose.yaml`](../compose.yaml) sets `REDIS_URL=redis://redis:6379/0` on the gateway service only. Do not point the Next.js browser client at the Redis hostname.

## Rate limit

Provider-side RPM (and optional TPM) on each deployment. There is no inbound HTTP limiter on FastAPI.

| Knob | Default |
| --- | --- |
| `GROQ_RPM` | 30 |
| `OPENAI_RPM` | 500 |
| `DEFAULT_RPM` | 60 (any other provider) |
| `GROQ_TPM` / `OPENAI_TPM` / `DEFAULT_TPM` | unset (no token cap on the Router) |

Pre-call checks skip a deployment that would exceed its RPM/TPM. At most 8 calls run in parallel (`default_max_parallel_requests`). Groq quotas are often token-shaped; set `GROQ_TPM` if you need that ceiling.

## Inspect

`GET /health` includes `reliability` (`retries`, `cache`, `cache_ttl`, `redis`, `fallback_policy`, `fallbacks`, `routing_strategy`). Env knobs are listed in [`.env.example`](../.env.example).

## Out of scope

LiteLLM already retries inside `router.acompletion` (provider `max_retries=0`). Wrapping `POST /chat` with Tenacity retries the whole Router call and can burst provider 429s. One `REDIS_URL` feeds the Router and the budget ledger; a second cache library would use different keys. Inbound HTTP limiting (SlowAPI) stays deferred. Public-bind control is optional [`GATEWAY_API_KEY`](auth.md). Router RPM/TPM protects provider quota.
