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

Protected: `/health`, `/providers`, `/models`, `/prompts`, `/budget`, `/memory`, `/chat`, `/config`, `/v1/*`. Open: `GET /` (HTML pointer), CORS preflight, `/docs`. Swagger try-it needs the header when auth is on.

The Next.js console talks to uvicorn directly. Paste the key into the console (sessionStorage). Do not put it in `NEXT_PUBLIC_*`; that bakes it into the JS bundle. Do not proxy `/chat` through Next.js.

`PATCH /config` requires a configured gateway key. When auth is off, that route returns 403 `gateway_key_required`, so an open Compose port cannot flip MEMORY / PII / GUARD.

Comparison uses `hmac.compare_digest` on padded bytes. Do not log the key.
