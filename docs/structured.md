# Structured output

The client can ask `POST /chat` to return JSON that matches a schema. Completions still go through LiteLLM's Router.

The client chooses the format (`response_format`). This layer verifies JSON. Pipeline order is in [architecture](architecture.md). Schema check runs after Presidio outbound and Llama Guard outbound.

There is no `STRUCT=1` env flag. Omit `response_format` and `POST /chat` with `model` and `messages` is free text.

## Enable (per request)

Pass OpenAI-shaped `response_format` on `POST /chat`.

`json_object`: the assistant body must parse as JSON (any shape):

```json
{ "type": "json_object" }
```

`json_schema`: the Router gets the schema, then this app validates the reply against it:

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "product_review",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "product_name": { "type": "string" },
        "rating": { "type": "number" }
      },
      "required": ["product_name", "rating"],
      "additionalProperties": false
    }
  }
}
```

`name` is 1-64 letters, digits, `_`, or `-`. The schema object is capped at 32KB. Invalid or oversized `response_format` is `400` before the Router.

The field is forwarded to `router.acompletion` for any catalog model. Groq strict constrained decoding is a provider feature on `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, and `qwen/qwen3.8-27b`. Everything else is best-effort JSON; this gateway still validates. If the provider rejects the schema, that error is not swallowed.

After Presidio and Llama Guard outbound, the assistant text is parsed (`json.loads`, optional one ` ```json ` fence) and checked with `jsonschema`. Failure is `400` (`SchemaError`): short reason and JSON path, never the raw blob. There is no reask.

JSON `POST /chat` sets `schema_valid: true` when this layer ran and passed.

`stream: true` together with `response_format` is `400`. Groq does not stream structured outputs; this gateway does not fake SSE.

PII placeholders must still satisfy the schema, or the request fails closed.

Mem0 extract is unchanged.

## Out of scope

Instructor reask, Outlines / Guidance / LM Format Enforcer (need logits), Guardrails AI validators, and `litellm.enable_json_schema_validation` (a global LiteLLM switch) are out of this process. Always-on JSON mode would break normal chat and the UI.
