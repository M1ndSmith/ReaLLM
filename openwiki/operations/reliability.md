---
type: Operations
title: Reliability, Budget, and Health
description: The router retries and shuffles providers. Daily spend is reserved before the call. Readiness fails closed when Redis or providers are down.
tags: [budget, redis, retries, readiness]
verified:
  - by: openwiki/0.5.2
    at: 2026-10-07T02:38:11.806Z
sources:
  - id: openwiki-source-97f23ee253be8b8aa9a32597
    resource: repo://app/api/errors.py
  - id: openwiki-source-847ab8edab35dbffc04d3d27
    resource: repo://app/api/routes/metrics.py
  - id: openwiki-source-a54b1761fbf225a26601a4d2
    resource: repo://app/api/routes/ready.py
  - id: openwiki-source-3a3d1241c76dff24f4f7a682
    resource: repo://app/infrastructure/billing_store.py
  - id: openwiki-source-3b70963b6d91715bfece2d1a
    resource: repo://app/infrastructure/budget.py
  - id: openwiki-source-e121e42c8bbea001634d580b
    resource: repo://app/infrastructure/router.py
generated: { by: "cursor", at: "2026-10-07T02:38:11.806Z" }
---

# Reliability, Budget, and Health

`LiteLLMRouterRuntime` is the only constructor of `litellm.Router`. The router uses `simple-shuffle`, a 45 second timeout, and a 60 second stream timeout. Retry count, cache, TTL, RPM, TPM, and fallbacks come from `GatewaySettings`.

## Budget reservation

`reserve` checks the input-token limit and the daily token and USD caps, then adds the estimate to the file ledger under a lock, or to Redis when a client is available. The returned reservation id is held across `acompletion`.

On success, `record_usage` subtracts the reserved estimate and applies the actual token count, including a negative delta when the call used fewer tokens than estimated. On provider failure, `release` subtracts the reservation. A cached completion releases the reservation instead of adding the provider usage. A crash after reserve and before release can leave the estimate in the ledger until the UTC day rolls.

Guard and memory-extractor calls call `record_usage` with the same `identity_id` and without a reservation, so those tokens add to that key's bucket.

Without Redis, the ledger is `data/budget-state.json` for the current process. More than one worker without `REDIS_URL` refuses startup unless `GATEWAY_ALLOW_SPLIT_BUDGET=1`. That switch does not move the key file or `runtime-flags.json` into Redis.

## Billing denial

A spend check that fails raises `BudgetExceededError`, which the API maps to HTTP 402. That covers the team daily cap, the per-call cap, and insufficient prepaid balance. An Arc RPC failure raises `BillingUnavailableError`, which maps to HTTP 503, and does not grant credit. See [Wallet Billing](billing.md).

## Readiness and metrics

`GET /ready` is `503` unless at least one provider is detected and Redis is reachable, or Redis is configured and degraded mode is allowed. Unconfigured Redis counts as ok. `GET /healthz` does not apply this gate. `GET /metrics` is `404` until metrics are enabled, then it returns Prometheus text.

`tests/test_budget.py` fires parallel reservations against a small cap. `tests/test_lifecycle.py` expects startup to raise when `WEB_CONCURRENCY=2` and Redis is unset.
