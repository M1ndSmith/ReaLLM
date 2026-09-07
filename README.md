# ReaLMM

ReaLMM is a FastAPI process in front of LiteLLM's Router. You put provider `*_API_KEY` values in `.env`, pick a catalog model, and send `messages`. Completions always go through that Router.

The Next.js console on port 3000 is a client of `POST /chat` and an operator UI for MEMORY / PII / GUARD overlay flags. The browser calls uvicorn on port 8000. Next does not proxy chat. Optional `GATEWAY_API_KEY` is inbound auth when the port is reachable from the network.

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

Provider keys stay in `.env`. Paste `GATEWAY_API_KEY` into the console (sessionStorage). Do not put it in `NEXT_PUBLIC_*`. Settings can toggle MEMORY / PII / GUARD when that gateway key is set. Embedder, Redis, and budgets still need `.env` and a restart.

## Docker Compose

Use Compose when you want Redis plus isolated spaCy / FastEmbed downloads. Iterate and test on the host venv. Images do not contain `.env`. Copy `.env.example` to `.env` and set at least one `*_API_KEY`.

```bash
cp .env.example .env
docker compose up --build
```

- Console: http://localhost:3000
- Gateway: http://127.0.0.1:8000

Compose sets `REDIS_URL=redis://redis:6379/0` on the gateway container. The browser still uses `http://127.0.0.1:8000`, never `http://gateway:8000`. The first request with `MEMORY=1` or `PII=1` may download ONNX or spaCy into `./data`.

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
npm run build
```

`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1` stops stray system pytest plugins (for example ROS `launch_testing`) from loading. Coverage is collected on `app/` and fails under 80%. The suite mocks providers, Langfuse, Mem0, Presidio, guard classifiers, and Redis. Do not run it inside Compose.

Malformed `DAILY_TOKEN_BUDGET`, `DAILY_USD_BUDGET`, `MAX_OUTPUT_TOKENS`, or `MEMORY_EMBEDDER` fail gateway startup. Empty optional budgets stay unset.

CI runs the same Python and web commands on every push.

## Layout

- `app/bootstrap.py` loads `.env` once and builds `GatewayRuntime`
- `app/settings.py` holds static ReaLMM knobs (`GatewaySettings`)
- `app/application/` is `ChatService` and ports
- `app/api/` is FastAPI routes and native / OpenAI encoders
- `app/infrastructure/` is catalog, Router, budget, prompts, PII, memory, guards, flags
- `web/` is the console (Playground, Connect, Settings)

## Endpoints

- `GET /health` process status, providers, reliability, prompts, budget, memory, PII, guardrails
- `GET /providers` providers inferred from env keys
- `GET /models` models for those providers
- `GET /v1/models` the same catalog in OpenAI list shape
- `GET /prompts` local (and Langfuse, if configured) prompt names
- `GET /budget` today's token/USD spend and configured caps
- `GET /config` and `PATCH /config` overlay flags for MEMORY / PII / GUARD (`PATCH` needs a configured `GATEWAY_API_KEY`)
- `GET /memory`, `POST /memory`, `DELETE /memory/{id}` Mem0 search, add, delete when `MEMORY=1`
- `POST /chat` `{ "model", "messages", "stream?", "prompt?", "user_id?", "conversation_id?", "agent_id?", "response_format?" }`. JSON by default; `stream: true` returns SSE
- `POST /v1/chat/completions` OpenAI envelope over the same pipeline; sidecars via `extra_body`

## Docs

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
