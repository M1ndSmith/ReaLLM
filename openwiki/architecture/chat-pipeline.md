---
type: Request pipeline
title: Chat Pipeline
description: How ChatService prepares a prompt, reserves budget, calls the router, and redacts a streamed reply once when PII is on.
tags: [chat, pipeline, pii, budget, memory]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T20:59:37.438Z
sources:
  - id: openwiki-source-614e7ba5f26867e646a960f7
    resource: repo://app/application/chat.py
generated: { by: "cursor", at: "2026-09-22T20:59:37.438Z" }
---

# Chat Pipeline

`ChatService.complete` and `ChatService.stream` share `_prepare_outgoing`. HTTP adapters only build the `ChatCommand`. See [HTTP API Surface](../api/http-surface.md) and [Optional Pipeline Layers](../integrations/optional-layers.md).

## Preflight

The flag snapshot is taken once per call. Prompt compilation runs first. If PII is on, `redact_messages` scans the compiled list. Memory attach then searches with `user_id` set to `command.identity_id`, not the client `user_id`. The client value is copied into completion metadata as `trace_user_id` when it is present.

If attach inserted a memory message, a second PII pass calls `redact_text` on that message only and splices it back. The original messages are not analyzed again.

When the guard layer is on, `assert_inbound` runs with the same `identity_id`. The catalog resolves the model. The budget runtime counts input tokens, checks RPM, then `reserve` commits that estimate for the identity before the provider call. The reservation id is returned with the prepared prompt.

## Completion

`complete` passes `response_format` through when it is set and validates the assistant text after the call. `record_usage` is called with the reservation id so the estimate is replaced by the actual token count. The local reservation id is cleared so the `finally` block does not release it a second time. If the provider call raises, `finally` releases the reservation.

Outbound PII redaction, the outbound content guard, and `schedule_record` use `identity_id` as the memory tenant.

## Streaming

`stream` raises `SchemaError` when `response_format` is set. It does not call the provider.

`buffer_output` is true when PII redacted the prompt, or when the inbound guard passed and the content guard is enabled. While buffering, token deltas are accumulated and not yielded. After the stream ends, PII runs `redact_text` once on the full assistant string, the outbound guard runs, and one `StreamDelta` carries the result. Without buffering, each non-empty delta is yielded as it arrives.

Usage recording and reservation release follow the same order as `complete`. A fallback model yields `StreamFallback` after the provider section.

## Tests

`tests/test_llm.py` covers identity-scoped memory attach, injected-memory-only redaction, a split-address SSE body, and reservation release when the provider raises. `tests/test_pipeline.py` records the preflight order.
