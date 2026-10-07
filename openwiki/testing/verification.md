---
type: Testing
title: Tests and Architecture Guards
description: Host pytest fails under 90 percent coverage of app. Architecture tests pin import boundaries. CI runs Ruff before pytest. NVIDIA tests cover the catalog alias, content safety, and the embedder.
tags: [pytest, coverage, vitest, architecture, nvidia]
verified:
  - by: openwiki/0.5.2
    at: 2026-10-07T02:38:11.806Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-05ccef8d4cf1698187f20464
    resource: repo://pyproject.toml
  - id: openwiki-source-f0a6e7dc03522b2682f88655
    resource: repo://tests/conftest.py
  - id: openwiki-source-f84c72498a1dc633d755f2da
    resource: repo://tests/test_architecture.py
  - id: openwiki-source-bc54074e7a7e46d4bf0b6d97
    resource: repo://tests/test_billing.py
  - id: openwiki-source-b88930386f1368fdf87082ba
    resource: repo://tests/test_nvidia.py
  - id: openwiki-source-eaca7303818019dc44e14256
    resource: repo://tests/test_publish_readiness.py
  - id: openwiki-source-14e56945b7c632a3b335dcec
    resource: repo://web/package.json
  - id: openwiki-source-7e102deb799a402d6babd279
    resource: repo://web/tests/billingClient.test.ts
  - id: openwiki-source-3d94fba251831ad22978cb80
    resource: repo://web/vitest.config.ts
generated: { by: "cursor", at: "2026-10-07T02:38:11.806Z" }
---

# Tests and Architecture Guards

Python tests live in `tests/` and run with pytest. `pyproject.toml` adds `pytest-cov` even when plugin autoload is off, measures the `app` package, and fails the run under 90 percent coverage. `app/static` is omitted. Ruff checks `app` and `tests` at line length 120.

`tests/conftest.py` sets `GATEWAY_ALLOW_OPEN=1` and `GATEWAY_KEY_PEPPER` so key hashing has a pepper, and it deletes `WEB_CONCURRENCY`, `UVICORN_WORKERS`, and `GATEWAY_ALLOW_SPLIT_BUDGET` so worker tests start from a clean process. It also sets `BILLING_MODE=off` so the suite does not create an Arc wallet or call the testnet RPC. Billing tests set the mode themselves.

## Import boundaries

`tests/test_architecture.py` parses the tree. `app/application` may not import FastAPI, Starlette, LiteLLM, Mem0, Presidio, Redis, `app.api`, or `app.infrastructure`. Only `app/infrastructure/router.py` may import `litellm.Router` or assign `litellm.cache`. Route modules may not import provider libraries.

`tests/test_publish_readiness.py` checks that `LICENSE` and `SECURITY.md` exist, that `.env` and `data/` are gitignored, that env presets contain a pepper placeholder and `GATEWAY_ALLOW_OPEN=1`, and that Compose forces the open flag off. It also checks `env/nvidia.env` and `config/nvidia.yaml`: the NIM key placeholder, the Nemotron embedder, the lightning chat model, and the content-safety id on both guard slots. It does not assert sentences in the operator guides.

## NVIDIA

`tests/test_nvidia.py` checks the `nvidia_nim` base URL, the `NVIDIA_API_KEY` alias, non-chat markers for content safety and the embedder, Nemotron injection and outbound scans, and embedder dimensions. A custom embedder id is rejected until `memory.embedding_dims` is set.

## Billing

`tests/test_billing.py` covers hold and settle, team caps, shadow mode, wallet prepaid even when the quota flag is off, the usage audit, reconcile, route responses, sidecar line items, the wallet file, Arc `balanceOf` decoding, RPC failure as 503, and the UTC-day rollover that keeps `lifetime_settled_usdc`.

`web/tests/billingClient.test.ts` checks status, usage, the team-policy patch, and reconcile. `web/tests/useBillingState.test.tsx` covers the hook that feeds the console rail.

## CI

`.github/workflows/ci.yml` runs on push and pull request. The Python job uses 3.12, 3.13, and 3.14 with `fail-fast: false` and a Redis service. It runs `ruff check`, `ruff format --check`, then `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest` with `TEST_REDIS_URL=redis://localhost:6379/0`. The web job runs `npm ci`, typecheck, coverage, and build on Node 22.

## Console

`web/package.json` runs `vitest run`. Coverage thresholds in `web/vitest.config.ts` are 90 percent lines and statements, 85 percent functions, and 80 percent branches over the app, components, hooks, and lib trees.

See [HTTP API Surface](../api/http-surface.md) for the routes those tests call, [Provider Catalog](../integrations/providers.md) for the NVIDIA catalog rules, and [System Architecture](../architecture/system.md) for the boundary the architecture tests enforce.
