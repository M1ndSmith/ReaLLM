# ReaLMM

ReaLMM is a self-hosted LLM operator built on top of @LiteLLM router. With a layer of necessary harness to run an agent that includes:

1. Unified LLM gateway with automatic provider detection and OpenAI-compatible endpoints
2. Memory
3. Policy enforcement and security
4. Routing: Retries, cache, and fallbacks
5. Observability and tracing
6. Operator console

## Prerequisites

Before installing, ensure you have met the following requirements:

- **Python 3.12**
- **Node.js 22**
- **Docker and Docker Compose** (if you use the published operator stack `gateway` + `web` + Redis).
- **At least one model source:** a provider `*_API_KEY` in `.env` (Groq, OpenAI, Anthropic, and others LiteLLM can detect), or a running local model using **Ollama**
- **Inbound auth:** `GATEWAY_ALLOW_OPEN=1` is loopback-only. Compose forces it off, so set **`GATEWAY_API_KEY` and `GATEWAY_KEY_PEPPER`** or the gateway will refuse to start.
- **Redis** for Compose and for more than one uvicorn worker (shared cache, RPM/TPM, and daily budget). A single local process can run without it.
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

## Contributing

Contributions are welcome! Please follow these steps to contribute:

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/Your-Feature`).
3. Commit your changes (`git commit -m 'Add some Your-Feature'`).
4. Push to the branch (`git push origin feature/Your-Feature`).
5. Open a Pull Request.

## License

Distributed under the **MIT License**. See [`LICENSE.md`](LICENSE.md) for more information.

## Contact

[LinkedIn](https://www.linkedin.com/in/samad-e)  
[a.eljoaydi@gmail.com](mailto:a.eljoaydi@gmail.com)  
[X](https://x.com/A_E1_Joaydi)

Project Link: [https://github.com/M1ndSmith/ReaLLM](https://github.com/M1ndSmith/ReaLLM)
