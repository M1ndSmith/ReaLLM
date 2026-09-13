# Inbound auth

`GATEWAY_API_KEY` is inbound auth for this process. It is not a provider `*_API_KEY`.

## Startup policy

Startup is fail-closed by default. The process requires `GATEWAY_API_KEY` (or an active issued key) unless you explicitly set `GATEWAY_ALLOW_OPEN=1`.

`GATEWAY_ALLOW_OPEN=1` is only for loopback development (`uvicorn --host 127.0.0.1`). With no configured key, JSON routes are open to anything that can reach the port; CORS limits browsers, not `curl` or other clients. Setting `GATEWAY_API_KEY` still enables authentication even if the open-startup opt-out is present.

Startup logs `gateway auth: off` (warning) or `gateway auth: on`. The log never prints the secret.

## On

Set `GATEWAY_API_KEY` in `.env` and restart uvicorn. For Compose or any bind reachable beyond the local machine, also set `GATEWAY_ALLOW_OPEN=0` and a dedicated `GATEWAY_KEY_PEPPER`. Compose forces closed mode, binds its published ports to `127.0.0.1`, and refuses to start authenticated without the pepper.

Clients send:

- `Authorization: Bearer <key>` (OpenAI SDK `api_key` against `base_url`)
- or `X-Api-Key: <key>`

Missing or wrong key is HTTP 401 `{ "detail": { "error": "gateway_unauthorized" } }`. LiteLLM `AuthenticationError` (provider credentials) is also 401, with a provider message.

Protected: `/health`, `/providers`, `/models`, `/prompts`, `/budget`, `/memory`, `/chat`, `/config`, `/ready`, `/metrics`, `/admin/keys`, `/v1/*`. Open: `GET /` (HTML pointer), `GET /healthz` (liveness), CORS preflight, `/docs`. Swagger try-it needs the header when auth is on.

The Next.js console talks to uvicorn directly. Paste the key into the console (sessionStorage). Do not put it in `NEXT_PUBLIC_*`; that bakes it into the JS bundle. Do not proxy `/chat` through Next.js.

`PATCH /config` requires a configured gateway key. When auth is off, that route returns 403 `gateway_key_required`, so open local development cannot flip MEMORY / PII / GUARD without first configuring a key.

## Scopes

When auth is on, routes also check scopes (`require_scopes` in [`app/api/dependencies.py`](../app/api/dependencies.py)). A route that lists more than one scope accepts any of them. If the key has none of those scopes, the response is HTTP 403 `{ "detail": { "error": "forbidden", "required_scope": "<first listed>" } }`. Auth off skips the check.

| Scope | Routes |
| --- | --- |
| `read` | `/health`, `/providers`, `/models`, `/prompts`, `/budget`, `/ready`, `/metrics` |
| `chat` | `POST /chat`, `POST /v1/chat/completions`, `POST /v1/embeddings`; memory write/delete |
| `config` | `PATCH /config` |
| `admin` | `/admin/keys` |

`GET /v1/models` and `GET /memory` accept `read` or `chat`. `GET /config` needs a valid key when auth is on, but no extra scope, so the console can still load identity. A chat-only key can call `/chat` and `/v1/models`. It cannot call `/health`.

## Keys

When `GATEWAY_API_KEY` is set, it resolves as identity `default` with all four scopes. Extra keys live in `data/gateway-keys.json` (`GET` / `POST` / `PATCH` / `DELETE /admin/keys/{key_id}`). Create returns the secret once. DELETE revokes. The console Settings page can list, create, and revoke when the pasted key has `admin`.

Comparison uses `hmac.compare_digest` on padded bytes. Do not log the key.
