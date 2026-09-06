# Memory sidecar

Chat can optionally search and write long-term facts with Mem0. The user-facing completion still goes through LiteLLM’s Router. This is not Letta, Zep, LangChain memory, or a homemade JSON transcript.

## When nothing is configured

Leave `MEMORY` unset (or `MEMORY=0`). `POST /chat` with only `model` and `messages` behaves as before.

## Enable

Set `MEMORY=1`. First request downloads a small FastEmbed ONNX model and creates `data/mem0/` (Qdrant on disk + SQLite history). `data/` is gitignored.

Mem0’s unconfigured default is OpenAI `gpt-5-mini` plus OpenAI embeddings. This app does not use that stack.

- **Extraction LLM:** the existing Router (`retries`, RPM, `record_usage`). Extract calls are tagged `mem0-extract` on Langfuse when tracing is on. `MEMORY_LLM_MODEL` selects the catalog id; if unset, the first chat model from `GET /models` is used. Do not point Mem0 at ReaLMM `POST /chat` (recursion). Avoid reasoning models; extraction needs `content`, not `reasoning_content`.
- **Embedder:** FastEmbed `BAAI/bge-small-en-v1.5` on CPU. Groq (and several other keyed providers) have no embeddings API; that is why FastEmbed is the default, not because this gateway is Groq-only. `MEMORY_EMBEDDER=openai` uses `text-embedding-3-small` and requires `OPENAI_API_KEY`. Changing embedder against an existing store needs a fresh `data/mem0`.
- **Store:** on-disk Qdrant at `data/mem0/qdrant`, history at `data/mem0/history.db`.

## Chat order

Langfuse compile → Presidio inbound (when `PII=1`) → Mem0 `search` → prepend `Relevant memory:` → Presidio on injected text → guard inbound (when `GUARD=1`) → budget → Router → Presidio outbound → Llama Guard outbound (when `GUARD_CONTENT` is on) → Mem0 `add` (background; extract errors are logged and do not fail the chat).

The client still sends `messages` (the hot window). Mem0 stores facts, not a replayable transcript. Refresh still clears the UI unless the client persists bubbles.

`POST /chat` accepts:

- `user_id` — defaults to `local` when memory is on
- `conversation_id` — mapped to Mem0 `run_id` on write; **New chat** in the UI mints a new one
- `agent_id` — for agent / MCP clients; the UI omits it

Search for injection is scoped by `user_id` (and `agent_id` if sent) so facts survive a new conversation. Writes also store `run_id` when `conversation_id` is present.

JSON responses and the first SSE event include `memories_used` (count of injected hits, or omitted when the layer is off). Memory text is not returned on chat.

## HTTP pairing surface

Agents can call these later via MCP; they are HTTP first.

- `GET /memory?q=&user_id=&conversation_id=&agent_id=` — Mem0 `search`
- `POST /memory` — `{ "messages", "user_id?", "conversation_id?", "agent_id?" }`
- `DELETE /memory/{id}`

Unset `MEMORY` → `503`.

When `GUARD_CONTENT` is on, `POST /memory` is scanned after Presidio and blocked with `400` if Llama Guard flags it (see [guardrails](guardrails.md)). `GET /memory` is not blocked for old unsafe hits.

`GET /health` includes `memory: { enabled, llm, embedder, vector }`.

## Do not stack extra products

Keep Router as the only completion path.

- **Letta:** agent runtime. Memory tools fire inside Letta, not this Router.
- **Zep / Graphiti:** temporal graph + Neo4j. Later, if entity/time queries become the job.
- **LangChain memory / ByteRover:** wrong product shape.
- **DIY JSON summaries:** a harness this gateway would have to keep.
