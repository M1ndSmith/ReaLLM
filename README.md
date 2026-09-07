# ReaLMM

FastAPI LLM gateway on LiteLLM. Providers come from `*_API_KEY` values in `.env`; the client picks a model. Completions go through LiteLLM’s Router. The Next.js console is a client of `POST /chat` (and an operator UI for overlay layer flags). Optional `GATEWAY_API_KEY` is inbound auth when the port is network-reachable.

## Run

Copy [`.env.example`](.env.example) to `.env` and set at least one key (`GROQ_API_KEY`, `OPENAI_API_KEY`, …). Copy [`web/.env.local.example`](web/.env.local.example) to `web/.env.local` if you need a non-default gateway URL.

Two processes:

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
- Gateway pointer: http://127.0.0.1:8000
- Swagger: http://127.0.0.1:8000/docs

The browser calls the gateway on port 8000 directly. Do not proxy `/chat` through Next.js. Provider keys stay in `.env`. Optional `GATEWAY_API_KEY` is pasted in the console (sessionStorage), never `NEXT_PUBLIC_*`. Settings can toggle MEMORY / PII / GUARD when that gateway key is set; embedder, Redis, and budgets still need `.env` and a restart.

## Providers

Set any keys from [`.env.example`](.env.example) (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, …). Empty keys are ignored. LiteLLM infers who is present; this app lists those providers and their models.

`GET /providers` and the console lamps show who is on. `GET /models` lists catalog ids. You send a **model** on `POST /chat`; the gateway does not auto-pick “the Groq one.”

Groq is optional. It is special only as **defaults**: Meta Prompt Guard / Llama Guard ids live on Groq’s catalog; Groq has no embeddings API (Mem0 uses FastEmbed unless `MEMORY_EMBEDDER=openai`); some Groq models support strict JSON. Chat, budget, and the Router work with whatever providers you keyed.

## Docker Compose

Optional operator path when you want Redis plus isolated spaCy / FastEmbed. Host `.venv` stays the way you iterate and test. Images do not contain `.env`.

```bash
cp .env.example .env   # set at least one *_API_KEY
docker compose up --build
```

- Console: http://localhost:3000
- Gateway: http://127.0.0.1:8000

Compose sets `REDIS_URL=redis://redis:6379/0` on the **gateway container** (Docker DNS). The browser still uses `http://127.0.0.1:8000` — never `http://gateway:8000`. First `MEMORY=1` / `PII=1` start may download ONNX / spaCy into `./data` (slow, then cached).

## Tests

```bash
uv pip install -r requirements-dev.txt
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest
```

`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1` stops stray system pytest plugins (for example ROS `launch_testing`) from loading. Coverage is collected on `app/` and fails under 80%. The suite mocks providers, Langfuse, Mem0, Presidio, guard classifiers, and Redis. Do not run this suite inside Compose.

## Docs

- [Architecture](docs/architecture.md) — pipeline, modules, what owns completions
- [Auth](docs/auth.md) — optional inbound `GATEWAY_API_KEY`
- [OpenAI `/v1`](docs/openai.md) — SDK adapter over the same Router pipeline
- [Reliability](docs/reliability.md) — Router retries, fallback allowlist, cache TTL, RPM/TPM, Redis
- [Prompts](docs/prompts.md) — Langfuse / local named prompts and Router traces
- [Budget](docs/budget.md) — tokens, USD, caps, Redis or file ledger
- [Memory](docs/memory.md) — optional Mem0 sidecar
- [PII](docs/pii.md) — optional Presidio mask in and out
- [Guardrails](docs/guardrails.md) — optional Prompt Guard 2 and Llama Guard 4
- [Structured output](docs/structured.md) — optional JSON Schema on `POST /chat`

## Endpoints

- `GET /health` — process status, detected providers, reliability, prompts, budget, memory, PII, guardrails
- `GET /providers` — providers inferred from env keys
- `GET /models` — models for those providers
- `GET /v1/models` — same catalog in OpenAI list shape
- `GET /prompts` — local (and Langfuse, if configured) prompt names
- `GET /budget` — today’s token/USD spend and configured caps
- `GET /config` / `PATCH /config` — overlay flags for MEMORY / PII / GUARD (`PATCH` needs a configured `GATEWAY_API_KEY`)
- `GET /memory` / `POST /memory` / `DELETE /memory/{id}` — Mem0 search, add, delete when `MEMORY=1`
- `POST /chat` — `{ "model", "messages", "stream?", "prompt?", "user_id?", "conversation_id?", "agent_id?", "response_format?" }`. JSON by default; `stream: true` returns SSE
- `POST /v1/chat/completions` — OpenAI envelope over the same pipeline; sidecars via `extra_body`

## Reliability

Chat goes through LiteLLM’s Router: retries, same-provider or `FALLBACKS` allowlist, response cache with TTL, and per-provider RPM (optional TPM). `REDIS_URL` is required past one uvicorn worker (shared cache, RPM/TPM/cooldown, daily budget). Knobs are in `.env.example`.

## Prompts

Optional named prompts from Langfuse Prompt Management, with `prompts/*.json` as fallback when keys are unset or Langfuse is down. Omit `prompt` to send raw messages. The same keys enable LiteLLM `langfuse_otel` traces (`LANGFUSE_TRACING=0` to opt out).

## Budget

LiteLLM counts tokens and USD. Each call is capped with `MAX_OUTPUT_TOKENS` (default 2048). Optional `MAX_INPUT_TOKENS`, `DAILY_TOKEN_BUDGET`, and `DAILY_USD_BUDGET` reject oversized or over-budget chats (`400` / `402`). The daily ledger is Redis when `REDIS_URL` is set, otherwise `data/budget-state.json`.

## Memory

Optional Mem0 sidecar (`MEMORY=1`): search facts, inject them into the prompt, then complete through the Router. Extraction uses that same Router; embeddings default to local FastEmbed.

## PII

Optional Presidio sidecar (`PII=1`): mask email, phone, card, SSN, IBAN, and IP on the way in and out. Completions still go through the Router. Unset `PII` leaves text unchanged.

## Guardrails

Optional Prompt Guard 2 and Llama Guard 4 (`GUARD=1`): block jailbreaks and unsafe content. Both classifiers are extra Router completions (same path as chat), not a second HTTP client and not LiteLLM Proxy.

## Structured output

Optional `response_format` on `POST /chat`: the client sends a JSON Schema (or `json_object`). The Router gets it; this app validates the reply. Omit the field for free text. Not Instructor, not a second LLM.

Do not commit `.env`. API responses never include keys.
