# Guardrails

Chat can optionally block prompt injection and unsafe content with Meta classifiers, called through LiteLLM’s Router. This is not NeMo, not Guardrails AI `guard()`, not Lakera, not archived LLM Guard, and not LiteLLM Proxy `guardrails:` YAML.

Llama Guard 4 **is** this gateway’s content moderator. Do not add OpenAI Moderation, Azure Content Safety, or Perspective on top of it.

## When nothing is configured

Leave `GUARD` unset (or `GUARD=0`). `POST /chat` with only `model` and `messages` behaves as before. No extra classifier calls.

## Enable

Set `GUARD=1`. Chat completions can use **any** keyed provider. The default classifiers are Groq-hosted Meta models; `GUARD=1` needs those ids in `GET /models` unless you override them.

Both scanners run unless you turn one off. If both are off, chat returns `503`.

- **Injection (Prompt Guard 2):** inbound user and system text, including Mem0 injects. Default catalog id `groq/meta-llama/llama-prompt-guard-2-22m`.
- **Content (Llama Guard 4):** inbound latest user message **and** injected system/memory text, plus outbound assistant text. Default catalog id `groq/meta-llama/llama-guard-4-12b`.

Those ids must appear in `GET /models`. Groq hosts the defaults. An OpenAI-only (or otherwise Groq-less) box needs `GROQ_API_KEY` **or** `GUARD_INJECTION_MODEL` / `GUARD_CONTENT_MODEL` pointing at catalog models. Missing ids → `503`.

Knobs:

- `GUARD_INJECTION=0` — skip Prompt Guard 2
- `GUARD_CONTENT=0` — skip Llama Guard 4
- `GUARD_INJECTION_MODEL` / `GUARD_CONTENT_MODEL` — catalog overrides
- `GUARD_CONTENT_IGNORE` — comma-separated MLCommons codes (`S6,S7`) that Llama Guard may return without blocking. Unset = block every `S*`. Unknown codes → `503`.

Classifier calls use the Router (`caching=False`, no chat fallbacks). Usage is recorded. Langfuse tags them `guard-injection` / `guard-content` when tracing is on. A failed guard never falls back to `gpt-oss`.

Blocked requests return `400` with `scanner`, `categories` (`S*` codes), and `category_names`. The attack text is not returned. Llama Guard does not emit confidence scores; this API does not invent them. Unknown classifier output is `503`, not treated as safe. A bare `unsafe` with no codes still blocks even if an ignore list is set.

## Content categories (MLCommons)

| Code | Name |
| --- | --- |
| S1 | Violent Crimes |
| S2 | Non-Violent Crimes |
| S3 | Sex-Related Crimes |
| S4 | Child Sexual Exploitation |
| S5 | Defamation |
| S6 | Specialized Advice |
| S7 | Privacy |
| S8 | Intellectual Property |
| S9 | Indiscriminate Weapons |
| S10 | Hate |
| S11 | Suicide & Self-Harm |
| S12 | Sexual Content |
| S13 | Elections |
| S14 | Code Interpreter Abuse |

`S6` often false-positives on coding or how-to questions. `S7` can overlap Presidio when `PII=1`; mask still runs first, then Llama Guard sees placeholders. Do not auto-ignore `S7` — set `GUARD_CONTENT_IGNORE=S7` if you want that.

Ignore is a **post-filter** on the codes Groq returns. HuggingFace `excluded_category_keys` is not available on Groq chat completions.

## Chat order

Langfuse compile → Presidio inbound → Mem0 inject → Presidio on injected text → **guard inbound** (Prompt Guard on user+system; Llama Guard on latest user and system/memory) → budget → Router → Presidio outbound → **Llama Guard on the assistant** → JSON or SSE → Mem0 `add`.

Guard runs after PII so classifier calls do not see raw SSNs. Inbound guard runs after Mem0 so injected memories are scanned.

JSON `POST /chat` includes `guard_passed: true` when the layer ran and did not block. The first SSE event includes the same field.

When `GUARD_CONTENT` is on and `stream: true`, raw token deltas are not sent. The gateway assembles the assistant text, scans it, then emits redacted-or-clean content. Combined with `PII=1`, output is still buffered once.

## Memory HTTP

When `GUARD_CONTENT` is on, `POST /memory` is scanned after Presidio and before Mem0 `add`. Unsafe writes return `400` with the same `scanner` / `categories` / `category_names` body. Chat `record_turn` is not scanned again; outbound Llama Guard already ran.

`GET /memory` is not blocked because an old hit is unsafe (that would brick the store). `DELETE` is unchanged.

## Inspect

`GET /health` includes `guard: { enabled, injection, content, injection_model, content_model, content_ignore }`. Health does not call the classifiers.

`llama-guard` and `prompt-guard` ids are excluded from same-provider chat fallbacks.

## Do not stack extra products

Keep the Router as the only completion path, including these classifiers. Llama Guard 4 is the content moderator.

- **OpenAI Moderation / `omni-moderation-latest` / `amoderation`:** a `/v1/moderations` client, not chat. LiteLLM Proxy `openai_moderation` YAML. Different taxonomy; text leaves the box; scores are the one thing Llama Guard does not provide — do not fake them here.
- **Azure Content Safety / Prompt Shield:** extra vendor; Proxy `azure/text_moderations`.
- **Perspective API:** comment toxicity scores; Google sees the prompt.
- **ShieldGemma / Granite Guardian / Shieldstral / gpt-oss-safeguard:** a second judge. gpt-oss-safeguard is “ask another chat model.”
- **NeMo Guardrails / Colang:** dialog runtime. It owns the conversation.
- **Guardrails AI `guard()` / reask:** wraps the LLM and retries off-Router.
- **Lakera:** third-party sees the prompt; LiteLLM Proxy hook.
- **LLM Guard (Protect AI):** archived; PII overlap.
- **Local torch Prompt Guard / HuggingFace category templates:** Groq already serves the Meta models.
- **LiteLLM Proxy guardrail YAML:** a different gateway.
- **Ask the chat model “is this safe?”:** extra cost, and the judge sees the attack.
- **Image moderation:** `POST /chat` is text.
