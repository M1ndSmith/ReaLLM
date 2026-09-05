# Named prompts

Chat can optionally prepend a named, versioned prompt before the messages you send. The LLM call still goes through LiteLLM’s Router. Tracing is not wired in this layer.

## When nothing is configured

Leave `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` unset. `POST /chat` with only `model` and `messages` behaves as before.

If you set `prompt` to a name that exists as `prompts/<name>.json`, that file is compiled and prepended. No Langfuse request is made.

## Langfuse

Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and optionally `LANGFUSE_BASE_URL` (or `LANGFUSE_HOST`). Then `prompt` is fetched with `get_prompt()`, compiled with `variables`, and prepended to `messages`.

Defaults:

- Label `production` when `prompt_version` is omitted
- Chat prompts first, then text prompts
- SDK cache (no extra hop after the first fetch)

If Langfuse is down, `get_prompt(..., fallback=)` plus the matching file in `prompts/` keep chat working. Some 5xx responses still raise in the SDK; those are caught and the local file is used.

## Request and response

`POST /chat` accepts:

- `prompt` — name (omit for messages only)
- `prompt_label` — optional, defaults to `production`
- `prompt_version` — optional integer; if set, label is not used
- `variables` — `{{name}}` substitutions

JSON responses include `prompt_name`, `prompt_version`, and `prompt_source` (`langfuse`, `local`, or `fallback`). Streaming sends the same fields on the first SSE event.

`GET /prompts` lists local JSON files and, when keys are set, remote names from the Public API.

`GET /health` includes `prompts: { enabled, source }` where `source` is `langfuse`, `local`, or `off`.

## Local file shape

See [`prompts/chat-assistant.json`](../prompts/chat-assistant.json). Chat:

```json
{
  "name": "chat-assistant",
  "type": "chat",
  "prompt": [{ "role": "system", "content": "You are a helpful assistant." }]
}
```

Text prompts use `"type": "text"` and `"prompt": "..."`. They become a single system message.