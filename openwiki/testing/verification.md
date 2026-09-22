---
type: Testing
title: Tests and Architecture Guards
description: Host pytest fails under 90 percent coverage of app. Architecture tests pin import boundaries. The console uses Vitest.
tags: [pytest, coverage, vitest, architecture]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T20:59:37.438Z
sources:
  - id: openwiki-source-05ccef8d4cf1698187f20464
    resource: repo://pyproject.toml
  - id: openwiki-source-f0a6e7dc03522b2682f88655
    resource: repo://tests/conftest.py
  - id: openwiki-source-f84c72498a1dc633d755f2da
    resource: repo://tests/test_architecture.py
  - id: openwiki-source-eaca7303818019dc44e14256
    resource: repo://tests/test_publish_readiness.py
  - id: openwiki-source-14e56945b7c632a3b335dcec
    resource: repo://web/package.json
  - id: openwiki-source-3d94fba251831ad22978cb80
    resource: repo://web/vitest.config.ts
generated: { by: "cursor", at: "2026-09-22T20:59:37.438Z" }
---

# Tests and Architecture Guards

Python tests live in `tests/` and run with pytest. `pyproject.toml` adds `pytest-cov` even when plugin autoload is off, measures the `app` package, and fails the run under 90 percent coverage. `app/static` is omitted.

`tests/conftest.py` sets `GATEWAY_ALLOW_OPEN=1` and `GATEWAY_KEY_PEPPER` so key hashing has a pepper, and it deletes `WEB_CONCURRENCY`, `UVICORN_WORKERS`, and `GATEWAY_ALLOW_SPLIT_BUDGET` so worker tests start from a clean process.

## Import boundaries

`tests/test_architecture.py` parses the tree. `app/application` may not import FastAPI, Starlette, LiteLLM, Mem0, Presidio, Redis, `app.api`, or `app.infrastructure`. Only `app/infrastructure/router.py` may import `litellm.Router` or assign `litellm.cache`. Route modules may not import provider libraries.

`tests/test_publish_readiness.py` checks that `LICENSE` and `SECURITY.md` exist, that `.env` and `data/` are gitignored, that env presets contain a pepper placeholder and `GATEWAY_ALLOW_OPEN=1`, and that Compose forces the open flag off. It does not assert sentences in the operator guides.

## Console

`web/package.json` runs `vitest run`. Coverage thresholds in `web/vitest.config.ts` are 90 percent lines and statements, 85 percent functions, and 80 percent branches over the app, components, hooks, and lib trees.

See [HTTP API Surface](../api/http-surface.md) for the routes those tests call and [System Architecture](../architecture/system.md) for the boundary the architecture tests enforce.
