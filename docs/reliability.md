# Retry, fallback, cache, and rate limits

Chat goes through LiteLLM’s Router in [`app/reliability.py`](../app/reliability.py). You still pick one model; this layer retries it, then falls back, caches, and caps RPM.

## Order of operations

1. Cache lookup (non-stream only)
2. RPM and parallel-request checks
3. Call the selected model
4. Retry on transient errors
5. Fall back to other chat models if it still fails

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

Only chat models. Ids containing `whisper`, `tts`, `orpheus`, or `prompt-guard` are skipped.

Order: other models from the same provider, then other providers. JSON `POST /chat` sets `fallback_from` to the model you asked for when a different catalog model actually answered. Streaming may send a final SSE meta event with the same fields; cache is not used on streams.

## Cache

On by default (`LITELLM_CACHE=1`). In-memory unless `REDIS_URL` is set.

The same non-stream model + messages returns `cached: true` on the next call. Streams pass `caching=False`.

## Rate limit

Provider-side RPM on each deployment, not inbound HTTP limiting.

| Knob | Default |
| --- | --- |
| `GROQ_RPM` | 30 |
| `OPENAI_RPM` | 500 |
| `DEFAULT_RPM` | 60 (any other provider) |

Pre-call checks skip a deployment that would exceed its RPM. At most 8 calls run in parallel (`default_max_parallel_requests`).

## Inspect

`GET /health` includes `reliability` (`retries`, `cache`, `fallbacks`, `routing_strategy`). Env knobs are listed in [`.env.example`](../.env.example).

## Do not stack extra libraries

Keep this Router as the only reliability layer. Extra Tenacity, a second Redis cache, or FastAPI rate limiting (SlowAPI) would sit outside the Router and multiply work it already did.

- **Tenacity:** LiteLLM already retries with Tenacity inside `router.acompletion`. Wrapping `POST /chat` retries the whole Router call (retries + fallbacks) and can burst provider 429s. LiteLLM pins provider `max_retries=0` so attempts are not squared.
- **Redis:** Optional via `REDIS_URL`. In-memory is correct for one uvicorn process. A second cache library would use different keys than LiteLLM. Set `REDIS_URL` later if you run multiple workers or hosts; do not add another cache client.
- **FastAPI limiter:** Router RPM protects provider quota. An HTTP limiter only helps if this API is public. Two uncoordinated 429s (FastAPI vs Groq) make debugging worse. Add inbound limits later only with auth on a network-exposed server.

