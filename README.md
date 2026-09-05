# ReaLMM

FastAPI LLM gateway on LiteLLM. Providers come from `*_API_KEY` values in `.env`; the client picks a model. Completions go through LiteLLM’s Router. The UI is a client of `POST /chat`, not the product.

## Run

Copy [`.env.example`](.env.example) to `.env` and set at least one key (`GROQ_API_KEY`, `OPENAI_API_KEY`, …).

```bash
uv pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- UI: http://127.0.0.1:8000
- Swagger: http://127.0.0.1:8000/docs

## Docs

- [Architecture](docs/architecture.md) — pipeline, modules, what owns completions
- [Reliability](docs/reliability.md) — Router retries, fallbacks, cache, RPM
- [Prompts](docs/prompts.md) — Langfuse / local named prompts
- [Budget](docs/budget.md) — tokens, USD, caps
- [Memory](docs/memory.md) — optional Mem0 sidecar

## Endpoints

- `GET /health` — process status, detected providers, reliability, prompts, budget, memory
- `GET /providers` — providers inferred from env keys
- `GET /models` — models for those providers
- `GET /prompts` — local (and Langfuse, if configured) prompt names
- `GET /budget` — today’s token/USD spend and configured caps
- `GET /memory` / `POST /memory` / `DELETE /memory/{id}` — Mem0 search, add, delete when `MEMORY=1`
- `POST /chat` — `{ "model", "messages", "stream?", "prompt?", "user_id?", "conversation_id?", "agent_id?" }`. JSON by default; `stream: true` returns SSE

## Reliability

Chat goes through LiteLLM’s Router: retries, fallbacks to other chat models, in-memory response cache, and per-provider RPM limits. Optional knobs (`LITELLM_NUM_RETRIES`, `LITELLM_CACHE`, `GROQ_RPM`, `REDIS_URL`) are in `.env.example`.

## Prompts

Optional named prompts from Langfuse Prompt Management, with `prompts/*.json` as fallback when keys are unset or Langfuse is down. Omit `prompt` to send raw messages.

## Budget

LiteLLM counts tokens and USD. Each call is capped with `MAX_OUTPUT_TOKENS` (default 2048). Optional `MAX_INPUT_TOKENS`, `DAILY_TOKEN_BUDGET`, and `DAILY_USD_BUDGET` reject oversized or over-budget chats (`400` / `402`).

## Memory

Optional Mem0 sidecar (`MEMORY=1`): search facts, inject them into the prompt, then complete through the Router. Extraction uses that same Router; embeddings default to local FastEmbed.

Do not commit `.env`. API responses never include keys.
