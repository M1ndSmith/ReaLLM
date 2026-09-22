---
type: Architecture
title: System Architecture
description: One FastAPI process wires ports to infrastructure in bootstrap, owns a single LiteLLM Router, and refuses a second worker when Redis is off.
tags: [architecture, fastapi, litellm, workers]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T20:59:37.438Z
sources:
  - id: openwiki-source-d542bf3e8de790d5c55e054f
    resource: repo://app/bootstrap.py
  - id: openwiki-source-f739a7216051b6f3d7707c10
    resource: repo://app/container.py
  - id: openwiki-source-21c0a295e6c6f5529dc70d5f
    resource: repo://app/main.py
  - id: openwiki-source-f84c72498a1dc633d755f2da
    resource: repo://tests/test_architecture.py
generated: { by: "cursor", at: "2026-09-22T20:59:37.438Z" }
---

# System Architecture

`app/main.py` exposes `app = create_configured_app()`. That is the uvicorn target. `bootstrap.build_runtime` is the only place that constructs infrastructure and hands it to `ChatService`. The application package depends on ports, not on FastAPI, LiteLLM, Mem0, or Presidio. API route modules do not import those providers. Infrastructure does not import `app.api`.

`tests/test_architecture.py` parses imports and fails if another module constructs `litellm.Router`.

## Runtime

`GatewayRuntime` holds settings, flags, catalog, router, prompts, budget, memory, PII, guards, identities, metrics, Redis health, and the chat service. `start` loads flags, enforces the auth and pepper rules, checks worker topology, then refreshes the catalog and prompts.

`ChatService` receives the router as a `CompletionBackend`. Guard and memory model calls go through that same backend. There is not a second router.

Files under `data/` are process-local: `gateway-keys.json`, `runtime-flags.json`, `budget-state.json`, and `mem0/`. Redis, when configured, shares cache, RPM, and the daily budget. It does not store the key file or the flag overlay.

## Workers

If `WEB_CONCURRENCY` or `UVICORN_WORKERS` is an integer greater than 1 and Redis is disabled, `start` raises `RuntimeError`. The message says cache, RPM/TPM/cooldown, and the daily budget would be per process. `GATEWAY_ALLOW_SPLIT_BUDGET=1` logs that warning and continues. The supported topology is one worker, or one worker plus Redis for those shared counters only.

See [Chat Pipeline](chat-pipeline.md) for a single request and [Reliability, Budget, and Health](../operations/reliability.md) for the ledger.
