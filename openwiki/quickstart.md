---
type: Quickstart
title: ReaLMM Quickstart
description: Where to start the gateway and console, and which wiki pages hold the architecture, API, and operations detail.
tags: [quickstart, compose, uvicorn, routing]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T20:59:37.438Z
sources:
  - id: openwiki-source-614e7ba5f26867e646a960f7
    resource: repo://app/application/chat.py
  - id: openwiki-source-f739a7216051b6f3d7707c10
    resource: repo://app/container.py
  - id: openwiki-source-21c0a295e6c6f5529dc70d5f
    resource: repo://app/main.py
  - id: openwiki-source-e201e686a785f09b6d899f0b
    resource: repo://compose.yaml
  - id: openwiki-source-a2621f3f09932d0c0a1db7e1
    resource: repo://env/groq.env
generated: { by: "cursor", at: "2026-09-22T20:59:37.438Z" }
---

# ReaLMM Quickstart

`app/main.py` exports the FastAPI app from `create_configured_app()`. Two ways to run it are in the README.

Compose is the published stack: copy `env/groq.env` to `.env`, set a provider key plus `GATEWAY_API_KEY` and `GATEWAY_KEY_PEPPER`, then `docker compose up --build -d`. Published ports stay on loopback. Compose forces `GATEWAY_ALLOW_OPEN=0`. The gateway is `http://127.0.0.1:8000` and the console is `http://localhost:3000`.

A host venv copies the same preset, which sets `GATEWAY_ALLOW_OPEN=1` for a loopback-only run, then starts `uvicorn app.main:app --host 127.0.0.1 --port 8000`. The console is `npm run dev` in `web/`.

`WEB_CONCURRENCY` or `UVICORN_WORKERS` greater than 1 without `REDIS_URL` raises at startup. `GATEWAY_ALLOW_SPLIT_BUDGET=1` turns that into a warning. Memory search and add use the authenticated key's `identity_id`, not the client `user_id`.

## Where to read next

- [Gateway Authentication](api/authentication.md) for keys, pepper, and scopes.
- [HTTP API Surface](api/http-surface.md) for public and authenticated routes.
- [System Architecture](architecture/system.md) and [Chat Pipeline](architecture/chat-pipeline.md) for process shape and one chat turn.
- [Provider Catalog](integrations/providers.md) and [Optional Pipeline Layers](integrations/optional-layers.md) for models, memory, PII, and guards.
- [Operator Console](console/operator-ui.md) for the Next.js UI.
- [Configuration and Runtime Flags](operations/configuration.md) and [Reliability, Budget, and Health](operations/reliability.md) for YAML, flags, budget, and readiness.
- [Tests and Architecture Guards](testing/verification.md) for pytest and Vitest.

Operator steps live in `README.md` and `USAGE_WALKTHROUGH.md`. Contribution steps live in `CONTRIBUTING.md`.
