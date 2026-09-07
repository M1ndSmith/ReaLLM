# 0003. Static settings vs runtime layer flags

## Status

Accepted.

## Context

ReaLMM used to call `load_dotenv` from many modules and flip MEMORY / PII / GUARD by mutating `os.environ`. That raced in-flight requests, hid provider secrets in ad-hoc getters, and made tests reset process environment to change flags.

## Decision

Configuration has three layers, in order:

1. Process/Compose environment, then `.env` once (`load_dotenv(..., override=False)`).
2. `GatewaySettings` (pydantic-settings) for ReaLMM-owned static knobs: auth, CORS, reliability, budgets, sidecar configuration, paths. Provider `*_API_KEY` values are not settings fields. LiteLLM discovers them from `os.environ`.
3. `RuntimeFlagStore` overlays only `MEMORY`, `PII`, `GUARD`, `GUARD_INJECTION`, and `GUARD_CONTENT` from `data/runtime-flags.json`. Snapshots are immutable. `PATCH /config` writes atomically and does not change `os.environ`.

Invalid security/capacity values (`DAILY_*_BUDGET`, `MAX_OUTPUT_TOKENS`, `MEMORY_EMBEDDER`) fail startup. Permissive fallbacks remain only where documented (retries, cache TTL, RPM).

## Consequences

A flag change applies to the next request, never half of an in-flight one. Restart reloads the JSON overlay. Secrets never appear in settings `repr`. The console Settings page can toggle the five booleans when a gateway key is configured. Embedder, Redis, budgets, and provider keys still need `.env` and a restart.
