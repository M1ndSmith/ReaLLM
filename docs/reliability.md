# Retry, fallback, cache, and rate limits

Chat goes through LiteLLM’s Router in [`app/reliability.py`](../app/reliability.py). You still pick one model; this layer retries it, then falls back, caches, and caps RPM/TPM.

## Order of operations

1. Cache lookup (non-stream only)
2. RPM/TPM and parallel-request checks
3. Call the selected model
4. Retry on transient errors
5. Fall back only to the allowlist (see below) if it still fails

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

The Router does **not** dump the whole catalog. A Groq `gpt-oss-20b` failure must not silently answer with `allam-2-7b`.

`FALLBACKS`:

| Value | Policy |
| --- | --- |
| unset | Same-provider chat models only (skips `whisper` / `tts` / `orpheus` / `prompt-guard` / `llama-guard` and weak ids such as `compound`, `allam`, `safeguard`, `canopy`) |
| `0` / `off` / `none` | Retry the requested model only |
| comma-separated catalog ids | Explicit allowlist (those chat models, minus the one you asked for) |

JSON `POST /chat` sets `fallback_from` to the model you asked for when a different catalog model actually answered. Streaming may send a final SSE meta event with the same fields; cache is not used on streams.

`GET /health` `reliability.fallback_policy` is `same-provider`, `allowlist`, or `retry-only`. `fallbacks` is that pool, not every chat id.

## Cache

On by default (`LITELLM_CACHE=1`). TTL is `LITELLM_CACHE_TTL` (default `120` seconds). Infinite identical-prompt hits are wrong for agents.

The same non-stream model + messages returns `cached: true` on the next call until TTL. Streams pass `caching=False`.

## Redis

In-memory cache, RPM/TPM, cooldown, and the daily budget file are correct for **one** uvicorn worker only.

Set `REDIS_URL` as soon as you run more than one process (agents / MCP / `--workers`). LiteLLM’s Router then shares response cache and TPM/RPM/cooldown across instances. The app’s daily ledger uses the same URL (see [budget](budget.md)). Do not add a second cache library.

On the host that is `redis://localhost:6379/0`. [`compose.yaml`](../compose.yaml) sets `REDIS_URL=redis://redis:6379/0` on the gateway service only. Do not point the Next.js browser client at the Redis hostname.

## Rate limit

Provider-side RPM (and optional TPM) on each deployment, not inbound HTTP limiting.

| Knob | Default |
| --- | --- |
| `GROQ_RPM` | 30 |
| `OPENAI_RPM` | 500 |
| `DEFAULT_RPM` | 60 (any other provider) |
| `GROQ_TPM` / `OPENAI_TPM` / `DEFAULT_TPM` | unset (no token cap on the Router) |

Pre-call checks skip a deployment that would exceed its RPM/TPM. At most 8 calls run in parallel (`default_max_parallel_requests`). Groq quotas are often token-shaped; set `GROQ_TPM` if you need that ceiling.

## Inspect

`GET /health` includes `reliability` (`retries`, `cache`, `cache_ttl`, `redis`, `fallback_policy`, `fallbacks`, `routing_strategy`). Env knobs are listed in [`.env.example`](../.env.example).

## Do not stack extra libraries

Keep this Router as the only reliability layer. Extra Tenacity, a second Redis cache, or FastAPI rate limiting (SlowAPI) would sit outside the Router and multiply work it already did.

- **Tenacity:** LiteLLM already retries with Tenacity inside `router.acompletion`. Wrapping `POST /chat` retries the whole Router call (retries + fallbacks) and can burst provider 429s. LiteLLM pins provider `max_retries=0` so attempts are not squared.
- **Redis:** One `REDIS_URL` into the Router (and the budget ledger). A second cache library would use different keys than LiteLLM.
- **FastAPI limiter:** Router RPM/TPM protects provider quota. An HTTP limiter only helps if this API is public. Two uncoordinated 429s (FastAPI vs Groq) make debugging worse. Inbound HTTP limiting stays deferred. Public-bind control is optional [`GATEWAY_API_KEY`](auth.md), not a second rate limiter.
