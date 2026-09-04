# ReaLMM

Local FastAPI chat app on LiteLLM. Providers come from `*_API_KEY` values in `.env`; you only pick a model.

## Run

Copy [`.env.example`](.env.example) to `.env` and set at least one key (`GROQ_API_KEY`, `OPENAI_API_KEY`, …).

```bash
uv pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- UI: http://127.0.0.1:8000
- Swagger: http://127.0.0.1:8000/docs

## Endpoints

- `GET /health` — process status, detected providers, reliability settings
- `GET /providers` — providers inferred from env keys
- `GET /models` — models for those providers
- `POST /chat` — `{ "model", "messages", "stream?" }`. JSON by default; `stream: true` returns SSE

## Reliability

Chat goes through LiteLLM’s Router: retries, fallbacks to other chat models, in-memory response cache, and per-provider RPM limits. Optional knobs (`LITELLM_NUM_RETRIES`, `LITELLM_CACHE`, `GROQ_RPM`, `REDIS_URL`) are in `.env.example`.

Do not commit `.env`. API responses never include keys.
