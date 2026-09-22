<img src="assets/reallm-logo-wordmark.png" alt="ReaLMM" width="1000" style="display: block; margin: 0 auto;">

# ReaLMM

ReaLMM is a self-hosted LLM operator built on top of LiteLLM router. A harness to run an agent includes:

1. Unified LLM gateway with automatic provider detection and OpenAI-compatible endpoints
2. Memory
3. Policy enforcement and security
4. Routing: Retries, cache, and fallbacks
5. Observability and tracing
6. Operator console

## Prerequisites

- **Python 3.12**
- **Node.js 22**
- **Docker and Docker Compose** (if you use the published operator stack `gateway` + `web` + Redis).
- **At least one model source:** a provider `*_API_KEY` in `.env` (Groq, OpenAI, Anthropic, and others LiteLLM can detect), or a running local model using **Ollama**
- **Inbound auth:** `GATEWAY_ALLOW_OPEN=1` is loopback-only. Compose forces it off, so set **`GATEWAY_API_KEY` and `GATEWAY_KEY_PEPPER`** or the gateway will refuse to start. `GATEWAY_KEY_PEPPER` is also required when any issued key exists, and before a new key is hashed, including open mode. Open mode with an empty key file may still serve the legacy gateway key.
- **Redis** for Compose. `WEB_CONCURRENCY` or `UVICORN_WORKERS` greater than 1 without `REDIS_URL` refuses to start. `GATEWAY_ALLOW_SPLIT_BUDGET=1` restores a warning and continues. Redis covers cache, RPM, and the daily budget. The key file and `data/runtime-flags.json` stay on one process. A single local process can run without Redis.
- **Optional extras:** `requirements-pii.txt` plus a spaCy model if `PII=1`; Langfuse keys if you want remote prompts and tracing instead of local `prompts/*.json`.

## Installation

There are two install paths. Compose is the published operator stack, a host venv is the local loopback path.

### Docker Compose

```bash
git clone https://github.com/M1ndSmith/ReaLLM.git
cd ReaLLM
cp env/groq.env .env
```

Edit `.env` and set:

- `GROQ_API_KEY` (or another provider key / Ollama)
- `GATEWAY_API_KEY`
- `GATEWAY_KEY_PEPPER`

Compose forces `GATEWAY_ALLOW_OPEN=0`, so the last two are required or the gateway will not start.

```bash
docker compose up --build -d
```

Gateway: `http://127.0.0.1:8000`  
Console: `http://localhost:3000`

### Host (venv)

```bash
git clone https://github.com/M1ndSmith/ReaLLM.git
cd ReaLLM
cp env/groq.env .env
```

Fill a provider key. Presets set `GATEWAY_ALLOW_OPEN=1` for this loopback-only run.

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Console, in another terminal:

```bash
cd web
cp .env.local.example .env.local
npm install
npm run dev
```

## Usage

Set the required values in `.env`, then:

### Check

```bash
set -a && . ./.env && set +a
curl -s http://127.0.0.1:8000/healthz
curl -s http://127.0.0.1:8000/models \
  -H "Authorization: Bearer ${GATEWAY_API_KEY}"
```

Skip the auth header only if you started the host path with `GATEWAY_ALLOW_OPEN=1` and no gateway key.

### Chat

```bash
curl -s http://127.0.0.1:8000/chat \
  -H "Authorization: Bearer ${GATEWAY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"groq/openai/gpt-oss-20b","messages":[{"role":"user","content":"hello"}]}'
```

Use an id from `/models`. For OpenAI SDKs, set `base_url` to `http://127.0.0.1:8000/v1` and `api_key` to the gateway key.

### Console

Open `http://localhost:3000`. Paste the gateway key if asked. Playground chats, Connect copies clients, Settings toggles layers and issues keys.

Operator details (scopes, sidecars, errors): [`USAGE_WALKTHROUGH.md`](USAGE_WALKTHROUGH.md).

## Configuration

- `.env` (`dotenv` file, no default): supplies gateway and provider settings to Docker Compose.
- `GROQ_API_KEY` (`string`, no default): required by the included `env/groq.env` provider preset.
- `GATEWAY_API_KEY` (`secret string`, no default): required because Docker Compose sets `GATEWAY_ALLOW_OPEN=0`.
- `GATEWAY_KEY_PEPPER` (`secret string`, no default): required when Docker Compose enables gateway authentication.
- Optional layers live in [`config/realmm.yaml`](config/realmm.yaml). Host presets: [`env/`](env/) selects [`config/`](config/). Env overrides YAML. Memory uses local FastEmbed unless `memory.embedder` is `openai`. Stored facts are scoped to the authenticated key (`default` for `GATEWAY_API_KEY`). A client `user_id` is trace metadata only. Facts already stored under `local` do not appear under a real key. Guards need `guards.enabled` plus `groq/meta-llama/llama-prompt-guard-2-22m` and `groq/meta-llama/llama-guard-4-12b`. With PII on, a streamed reply is buffered and redacted once at the end. The chat estimate is reserved before the provider call. Operator details: [Usage walkthrough](USAGE_WALKTHROUGH.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

## Contact

[LinkedIn](https://www.linkedin.com/in/samad-e)  
[a.eljoaydi@gmail.com](mailto:a.eljoaydi@gmail.com)  
[X](https://x.com/A_E1_Joaydi)

Project Link: [https://github.com/M1ndSmith/ReaLLM](https://github.com/M1ndSmith/ReaLLM)
