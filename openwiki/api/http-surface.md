---
type: API surface
title: HTTP API Surface
description: Public liveness versus authenticated routes, and how native and OpenAI-compatible chat both become a ChatCommand.
tags: [http, api, openai, chat]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T20:59:37.438Z
sources:
  - id: openwiki-source-1a98b5004c773391f6b97056
    resource: repo://app/api/app.py
  - id: openwiki-source-0bc324b91567c3bd271944bb
    resource: repo://app/api/routes/chat.py
  - id: openwiki-source-e812c2e9eae3d62ac11cc5a2
    resource: repo://app/api/routes/meta.py
  - id: openwiki-source-edfc78d1c541ab16261576a4
    resource: repo://app/api/routes/openai.py
  - id: openwiki-source-a54b1761fbf225a26601a4d2
    resource: repo://app/api/routes/ready.py
  - id: openwiki-source-dd71c44d9894dc90e18c4579
    resource: repo://app/api/routes/root.py
generated: { by: "cursor", at: "2026-09-22T20:59:37.438Z" }
---

# HTTP API Surface

The FastAPI app mounts two routers. `GET /` and `GET /healthz` live on the root router and do not call `require_gateway_auth`. Every other route is included on a router that does. Scope checks are a second gate on top of that. See [Gateway Authentication](authentication.md).

`GET /` returns an HTML pointer to the console URL and `/docs`. `GET /healthz` returns `{"status":"ok"}` and does not check providers or Redis.

## Catalog, health, and config

These routes require the `read` scope, except `GET /config`, which only requires a passing gateway auth check:

| Method and path | Scope | Role |
| --- | --- | --- |
| `GET /health` | `read` | Broad process status. It can report degraded. |
| `GET /providers`, `GET /models`, `GET /prompts`, `GET /budget` | `read` | Catalog, local prompts, and the budget snapshot. |
| `GET /ready` | `read` | Strict gate. `503` unless a provider is detected and Redis is reachable or explicitly allowed degraded. |
| `GET /metrics` | `read` | Prometheus text when metrics are enabled; otherwise `404`. |
| `GET /config` | auth only | Runtime layer flags and the bound identity. |
| `PATCH /config` | `config` | Writes the runtime-flag overlay. Also requires a configured gateway key. |

`GET /v1/models` accepts `read` or `chat`.

## Chat and embeddings

`POST /chat` requires `chat`. The handler builds a `ChatCommand` with `identity_id` from the authenticated key and `user_id` from the body. Streaming responses use the native SSE encoder. A request that sets both `stream` and `response_format` is rejected before the provider call.

`POST /v1/chat/completions` requires `chat`. The OpenAI body is converted to the same `ChatRequest` and then the same `ChatCommand`. Streaming uses the OpenAI SSE encoder. Structured output is also refused on that stream path.

`POST /v1/embeddings` requires `chat`. It resolves the catalog id, checks RPM, reserves a token estimate for the caller identity, and releases that reservation if the provider call fails.

Memory routes are `GET /memory` (`read` or `chat`), `POST /memory` (`chat`), and `DELETE /memory/{id}` (`chat`). Admin key routes require `admin` and are described on the authentication page.

## Tests

`tests/test_route_surface.py` locks which paths exist. Chat and OpenAI compatibility behavior is covered by `tests/test_main.py` and `tests/test_openai_compat.py`.
