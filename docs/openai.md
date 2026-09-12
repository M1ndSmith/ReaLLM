# OpenAI-compatible `/v1`

Native chat is `POST /chat` (custom JSON and SSE). SDKs that want OpenAI's envelope use:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/embeddings`

Chat completions run the same pipeline as `/chat` (`ChatService.complete` / `ChatService.stream` → LiteLLM Router). Embeddings resolve a catalog `model` and call the Router `aembedding` path. They do not run MEMORY / PII / GUARD.

## JSON

Request fields: `model`, `messages`, `stream`, `response_format`, `user`, `temperature`, `max_tokens`, `tools`, `tool_choice`. Sidecars (`prompt`, `prompt_label`, `prompt_version`, `variables`, `user_id`, `conversation_id`, `agent_id`) are accepted on the body (OpenAI SDK: `extra_body`). `user_id` wins over `user`. `max_tokens` is clamped to `MAX_OUTPUT_TOKENS`. Other OpenAI params (`n`, and similar) are ignored.

Response: `id`, `object: chat.completion`, `created`, `choices[0].message`, `usage`. ReaLMM extras stay at the top level (`provider`, `cached`, `fallback_from`, `memories_used`, `pii_redacted`, `guard_passed`, `schema_valid`, `cost_usd`, prompt meta). Strict SDKs ignore them.

## Stream

`stream: true` emits OpenAI `chat.completion.chunk` objects (`choices[0].delta.content`) and `data: [DONE]`. Sidecar meta is extra keys on the first chunk. `stream` plus `response_format` is HTTP 400 JSON before SSE starts (same as `/chat`). Errors after the stream starts are `{ "error": { "message", "type" } }` then `[DONE]`.

## Models

`GET /v1/models` is `{ "object": "list", "data": [ { "id", "object": "model", "owned_by" } ] }` from the same catalog as `GET /models`. When auth is on it accepts `read` or `chat`.

## Embeddings

`POST /v1/embeddings` needs `chat` scope when auth is on. Body: `model` (catalog id), `input` (string or list of strings), optional `encoding_format` and `user`. Response is OpenAI list shape (`object: list`, `data[].embedding`, `usage`).

## Client

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8000/v1",
    api_key=os.environ.get("GATEWAY_API_KEY") or "local",
)
client.chat.completions.create(
    model="groq/openai/gpt-oss-20b",
    messages=[{"role": "user", "content": "hello"}],
    extra_body={"user_id": "agent-42"},
)
```

When gateway auth is off, `api_key` can be any placeholder because the SDK always sends Bearer.

There is no `/v1/moderations` or `/v1/completions`.
