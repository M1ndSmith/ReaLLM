# PII detection and redaction

Chat can optionally mask sensitive text with Microsoft Presidio before it reaches Mem0, the Router, or the client. Completions still go through LiteLLM’s Router. This is not LiteLLM Proxy guardrails, not log-only redaction, and not reversible unmasking.

## When nothing is configured

Leave `PII` unset (or `PII=0`). `POST /chat` with only `model` and `messages` behaves as before. spaCy is not loaded.

## Enable

Set `PII=1`. The first request loads Presidio’s analyzer and anonymizer and, if needed, downloads spaCy `en_core_web_sm`. If that load fails, chat and memory routes return `503` (fail closed). Do not skip redaction silently.

Default entities (pattern recognizers; no `PERSON` names):

- `EMAIL_ADDRESS`
- `PHONE_NUMBER`
- `CREDIT_CARD`
- `US_SSN`
- `IBAN_CODE`
- `IP_ADDRESS`

Knobs:

- `PII_ENTITIES` — comma-separated Presidio types. Include `PERSON` only if you accept NER false positives.
- `PII_SPACY_MODEL` — defaults to `en_core_web_sm`. `en_core_web_lg` is optional and much larger.

Masking uses placeholders such as `<EMAIL_ADDRESS>`. The client does not get original values back. `model`, `user_id`, `conversation_id`, and `agent_id` are not redacted.

## Chat order

Langfuse compile → Presidio inbound → Mem0 `search` / inject → Presidio on injected memory text → guard inbound (when `GUARD=1`) → budget → Router → Presidio outbound → Llama Guard outbound (when `GUARD_CONTENT` is on) → JSON or SSE → Mem0 `add` of already-redacted text.

Langfuse traces see whatever was sent to `acompletion`, so inbound redaction covers traces. There is no logging-only pass.

JSON `POST /chat` includes `pii_redacted` (true when the layer is on) and `pii_entities` (entity types found, never spans). The first SSE event includes `pii_redacted`.

When `PII=1` and `stream: true`, raw token deltas are not sent. The gateway assembles the model output, redacts it, then emits the redacted text as SSE `content`. First-token latency rises; that is the cost of masking the way out.

## Memory HTTP

When `PII=1`, `GET /memory` redacts the query going in and hit text coming out. `POST /memory` redacts message bodies and result `memory` fields. Old stores may already contain PII; outbound masking covers that.

## Inspect

`GET /health` includes `pii: { enabled, engine, entities }`. `engine` is `presidio` when the layer is on. Health does not load spaCy.

## Do not stack extra products

Keep Presidio as text rewrite around the Router.

- **LiteLLM Proxy Presidio `config.yaml`:** a different gateway. This app calls `router.acompletion`.
- **`logging_only` / API-key log redaction:** logs are not the chat payload.
- **Tokenize then unmask to the client:** contradicts outbound masking.
- **Regex-only / Scrubadub as a second library:** Presidio already has pattern recognizers.
- **AWS Comprehend / Google DLP / an extra LLM detector:** PII would leave the box, or a second model would see it.
