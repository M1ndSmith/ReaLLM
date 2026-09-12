# Inbound auth

`GATEWAY_API_KEY` is optional inbound auth for this process. It is not a provider `*_API_KEY`.

## Off (default)

Unset or empty `GATEWAY_API_KEY` leaves JSON routes open. That is the loopback path (`uvicorn --host 127.0.0.1`). CORS still limits browser origins. `curl` is unconstrained.

Compose publishes `8000:8000` on all interfaces. Set a gateway key when that port is reachable from the network.

Startup logs `gateway auth: off` (warning) or `gateway auth: on`. The log never prints the secret.

## On

Set `GATEWAY_API_KEY` in `.env` and restart uvicorn. Clients send:

- `Authorization: Bearer <key>` (OpenAI SDK `api_key` against `base_url`)
- or `X-Api-Key: <key>`

Missing or wrong key is HTTP 401 `{ "detail": { "error": "gateway_unauthorized" } }`. LiteLLM `AuthenticationError` (provider credentials) is also 401, with a provider message.

Protected: `/health`, `/providers`, `/models`, `/prompts`, `/budget`, `/memory`, `/chat`, `/config`, `/ready`, `/metrics`, `/admin/keys`, `/v1/*`. Open: `GET /` (HTML pointer), CORS preflight, `/docs`. Swagger try-it needs the header when auth is on.

The Next.js console talks to uvicorn directly. Paste the key into the console (sessionStorage). Do not put it in `NEXT_PUBLIC_*`; that bakes it into the JS bundle. Do not proxy `/chat` through Next.js.

`PATCH /config` requires a configured gateway key. When auth is off, that route returns 403 `gateway_key_required`, so an open Compose port cannot flip MEMORY / PII / GUARD.

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

When `GATEWAY_API_KEY` is set, it resolves as identity `default` with all four scopes. Extra keys live in `data/gateway-keys.json` (`GET` / `POST` / `PATCH` / `DELETE /admin/keys`). Create returns the secret once. DELETE revokes. The console Settings page can list, create, and revoke when the pasted key has `admin`.

Comparison uses `hmac.compare_digest` on padded bytes. Do not log the key.
