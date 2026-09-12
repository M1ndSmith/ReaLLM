# ReaLMM

ReaLMM is a FastAPI process in front of LiteLLM's Router. Put provider `*_API_KEY` values in `.env`, pick a catalog model, and send `messages`. All completions go through the Router.

The Next.js console on port 3000 is a client of `POST /chat` and an operator UI for MEMORY / PII / GUARD overlay flags and inbound keys. The browser calls uvicorn on port 8000. Next does not proxy chat.

## Run

Copy [`.env.example`](.env.example) to `.env` and set at least one provider key (`GROQ_API_KEY`, `OPENAI_API_KEY`, and so on). Copy [`web/.env.local.example`](web/.env.local.example) to `web/.env.local` only if the console should use a gateway URL other than `http://127.0.0.1:8000`.

```bash
uv pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
cd web
npm install
npm run dev
```

- Console: http://localhost:3000
- Gateway: http://127.0.0.1:8000
- Swagger: http://127.0.0.1:8000/docs

Provider keys stay in `.env`.

Inbound auth is fail-closed. Set `GATEWAY_API_KEY` (or issue keys) unless you explicitly set `GATEWAY_ALLOW_OPEN=1` for loopback-only work. Compose forces `GATEWAY_ALLOW_OPEN=0` and binds `127.0.0.1:8000`. Send `Authorization: Bearer` or `X-Api-Key` on API calls, and paste the same key into the console (sessionStorage). Do not put it in `NEXT_PUBLIC_*`. Inbound keys have scopes (`read`, `chat`, `config`, `admin`); a chat-only key cannot hit `/health`.

Settings can toggle MEMORY / PII / GUARD when that key has `config`. The same page can create and revoke extra keys when it has `admin`. Embedder, Redis, and process budgets still require `.env` changes and a restart.

Playground prints per-reply tokens and USD from the chat stream. Daily totals are on `GET /budget` and `GET /health`. Optional `OBS_*` and Langfuse keys are listed in `.env.example`.

## Docker Compose

Use Compose when you want Redis plus isolated spaCy / FastEmbed downloads. Use the host venv for iteration and tests. Images do not contain `.env`. Copy `.env.example` to `.env`, set at least one provider `*_API_KEY`, and set `GATEWAY_API_KEY` (Compose refuses to start open).

```bash
cp .env.example .env
docker compose up --build
```

- Console: http://localhost:3000
- Gateway: http://127.0.0.1:8000

Compose sets `REDIS_URL=redis://redis:6379/0` on the gateway container. The browser still uses `http://127.0.0.1:8000`, never `http://gateway:8000`. The first request with `MEMORY=1` or `PII=1` may download ONNX or spaCy into `./data`. Images run as uid 1000; if `./data` is root-owned, `chown -R 1000:1000 data`.

## Tests

```bash
uv pip install -r requirements-dev.txt
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest
.venv/bin/ruff check
.venv/bin/ruff format --check
```

```bash
cd web
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run build
```

`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1` stops stray system pytest plugins (for example ROS `launch_testing`) from loading. Coverage is collected on `app/` and fails under 90%. The suite mocks providers, Langfuse, Mem0, Presidio, guard classifiers, and Redis. Do not run the suite inside Compose.

Malformed `DAILY_TOKEN_BUDGET`, `DAILY_USD_BUDGET`, `MAX_OUTPUT_TOKENS`, or `MEMORY_EMBEDDER` fail gateway startup. Empty optional budgets stay unset.

CI runs pytest (with a Redis service) and, in `web/`, `npm run typecheck`, `npm run test:coverage`, and `npm run build`. `npm test` is the fast local run without the coverage gate.

## Layout

- `app/bootstrap.py` loads `.env` once and builds `GatewayRuntime`
- `app/settings.py` holds static ReaLMM knobs (`GatewaySettings`)
- `app/application/` is `ChatService` and ports
- `app/api/` is FastAPI routes and native / OpenAI encoders
- `app/infrastructure/` is catalog, Router, budget, prompts, PII, memory, guards, flags
- `web/` is the console (Playground, Connect, Settings)

## Providers

Set any keys from [`.env.example`](.env.example). Empty keys are ignored. LiteLLM infers which providers are present, and this app lists those providers and their models. You send a catalog `model` on `POST /chat`.

You can copy a file from [`env/`](env/) over `.env` (`cp env/groq.env .env`), fill `GROQ_API_KEY` if that preset uses Groq, and restart uvicorn.

Ollama is the same opt-in: set `OLLAMA_API_KEY` to any dummy value (Ollama does not check it) and optionally `OLLAMA_API_BASE` (default `http://127.0.0.1:11434`). Catalog ids look like `ollama/llama3.2`. From Docker, point BASE at `host.docker.internal` or the host IP. Leave `GUARD=0` unless the default classifier ids are in `GET /models`. Pull and run the model once so the first chat is not a cold load.

## Endpoints

- `GET /health` process status, providers, reliability, prompts, budget, memory, PII, guardrails (`read`)
- `GET /ready` strict readiness (`read`; 503 when not ready)
- `GET /providers` providers inferred from env keys (`read`)
- `GET /models` models for those providers (`read`)
- `GET /v1/models` the same catalog in OpenAI list shape (`read` or `chat`)
- `GET /prompts` local (and Langfuse, if configured) prompt names (`read`)
- `GET /budget` today's token/USD spend and configured caps (`read`)
- `GET /metrics` Prometheus text when `OBS_METRICS=1` (`read`)
- `GET /config` overlay flags and the calling identity (`auth` only; no extra scope)
- `PATCH /config` overlay flags for MEMORY / PII / GUARD (`config`, plus a configured `GATEWAY_API_KEY`)
- `GET` / `POST` / `PATCH` / `DELETE /admin/keys` inbound key lifecycle (`admin`)
- `GET /memory`, `POST /memory`, `DELETE /memory/{id}` Mem0 search, add, delete when `MEMORY=1` (`read` or `chat` on GET; `chat` on write/delete)
- `POST /chat` `{ "model", "messages", "stream?", "prompt?", "user_id?", "conversation_id?", "agent_id?", "response_format?", "temperature?", "max_tokens?", "tools?" }`. JSON by default; `stream: true` returns SSE (`chat`)
- `POST /v1/chat/completions` OpenAI envelope over the same pipeline; sidecars via `extra_body` (`chat`)
- `POST /v1/embeddings` catalog `model` plus `input` (`chat`)

## Docs

- [Usage walkthrough](USAGE_WALKTHROUGH.md)
- [Architecture](docs/architecture.md)
- [ADRs](docs/adr/0001-modular-monolith.md)
- [Auth](docs/auth.md)
- [OpenAI `/v1`](docs/openai.md)
- [Reliability](docs/reliability.md)
- [Prompts](docs/prompts.md)
- [Budget](docs/budget.md)
- [Memory](docs/memory.md)
- [PII](docs/pii.md)
- [Guardrails](docs/guardrails.md)
- [Structured output](docs/structured.md)

Env examples are in [`.env.example`](.env.example). Do not commit `.env`. API responses never include keys.

## License

[MIT](LICENSE). See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.
