# PII detection and redaction

Chat can mask sensitive text with Microsoft Presidio before it reaches Mem0, the Router, or the client. Completions still go through LiteLLM's Router.

Pipeline order is in [architecture](architecture.md). Presidio runs inbound after prompt compile, again on injected memory text, and outbound on the assistant reply. Masking is not reversible.

## Off

Leave `PII` unset (or `PII=0`). `POST /chat` with only `model` and `messages` behaves as before. spaCy is not loaded.

## On

Set `PII=1`. The first request loads Presidio's analyzer and anonymizer and, if needed, downloads spaCy `en_core_web_sm`. If that load fails, chat and memory routes return `503` (fail closed). Do not skip redaction silently.

Default entities (pattern recognizers; no `PERSON` names):

- `EMAIL_ADDRESS`
- `PHONE_NUMBER`
- `CREDIT_CARD`
- `US_SSN`
- `IBAN_CODE`
- `IP_ADDRESS`

Knobs:

- `PII_ENTITIES`: comma-separated Presidio types. Include `PERSON` only if you accept NER false positives.
- `PII_SPACY_MODEL`: defaults to `en_core_web_sm`. `en_core_web_lg` is optional and much larger.

Masking uses placeholders such as `<EMAIL_ADDRESS>`. The client does not get original values back. `model`, `user_id`, `conversation_id`, and `agent_id` are not redacted.

Langfuse traces see whatever was sent to `acompletion`, so inbound redaction covers traces. There is no logging-only pass.

JSON `POST /chat` includes `pii_redacted` (true when the layer is on) and `pii_entities` (entity types found, never spans). The first SSE event includes `pii_redacted`.

When `PII=1` and `stream: true`, raw token deltas are not sent. The gateway assembles the model output, redacts it, then emits the redacted text as SSE `content`. First-token latency rises.

## Memory HTTP

When `PII=1`, `GET /memory` redacts the query going in and hit text coming out. `POST /memory` redacts message bodies and result `memory` fields. Old stores may already contain PII; outbound masking covers that.

## Inspect

`GET /health` includes `pii: { enabled, engine, entities }`. `engine` is `presidio` when the layer is on. Health does not load spaCy.

## Out of scope

Presidio is text rewrite around the Router. LiteLLM Proxy Presidio `config.yaml`, log-only / API-key redaction, tokenize-then-unmask, a second regex library, and cloud DLP or an extra LLM detector are out of this process.
