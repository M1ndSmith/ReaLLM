---
type: Request pipeline
title: Chat Pipeline
description: How ChatService prepares a prompt, reserves budget, calls the router, redacts a buffered stream once, and sends the latest user turn with the assistant reply to a content-safety outbound scan.
tags: [chat, pipeline, pii, budget, memory, guards]
sources:
  - id: openwiki-source-614e7ba5f26867e646a960f7
    resource: repo://app/application/chat.py
  - id: openwiki-source-c408e90cd85dd093896698de
    resource: repo://app/infrastructure/guards.py
generated: { by: "cursor", at: "2026-10-07T02:38:11.806Z" }
verified:
  - by: openwiki/0.5.2
    at: 2026-10-07T02:38:11.806Z
---

# Chat Pipeline

`ChatService.complete` and `ChatService.stream` share `_prepare_outgoing`. HTTP adapters only build the `ChatCommand`. See [HTTP API Surface](../api/http-surface.md) and [Optional Pipeline Layers](../integrations/optional-layers.md).

## Preflight

The flag snapshot is taken once per call. Prompt compilation runs first. If PII is on, `redact_messages` scans the compiled list. Memory attach then searches with `user_id` set to `command.identity_id`, not the client `user_id`. The client value is copied into completion metadata as `trace_user_id` when it is present.

If attach inserted a memory message, a second PII pass calls `redact_text` on that message only and splices it back. The original messages are not analyzed again.

When the guard layer is on, `assert_inbound` runs with the same `identity_id`. The catalog resolves the model. The budget runtime counts input tokens, checks RPM, then `reserve` commits that estimate for the identity before the provider call. When a billing coordinator is wired, `pre_authorize` then holds the estimated USD for the same identity. Both the token reservation id and the billing reservation are returned with the prepared prompt.

## Completion

`complete` passes `response_format` through when it is set and validates the assistant text after the call. `record_usage` is called with the reservation id so the estimate is replaced by the actual token count. The local reservation id is cleared so the `finally` block does not release it a second time. If the provider call raises, `finally` releases the token reservation and, when a billing hold is still open, releases that hold. A successful call settles the hold and appends the usage audit before clearing the billing reservation, so `finally` does not release it again.

Outbound PII redaction runs when the preflight PII flag is set. The outbound content guard then runs when the inbound guard passed. Both `complete` and `stream` pass `_latest_user_text(outgoing)` as `user_text`. `schedule_record` uses `identity_id` as the memory tenant.

## Streaming

`stream` raises `SchemaError` when `response_format` is set. It does not call the provider.

`buffer_output` is true when PII redacted the prompt, or when the inbound guard passed and the content guard is enabled. While buffering, token deltas are accumulated and not yielded. After the stream ends, PII runs `redact_text` once on the full assistant string, the outbound guard runs, and one `StreamDelta` carries the result. Without buffering, each non-empty delta is yielded as it arrives.

Usage recording and reservation release follow the same order as `complete`. A fallback model yields `StreamFallback` after the provider section.

## Outbound content-safety pair

`GuardService.scan_content` treats a model id that contains `content-safety` as Nemotron content safety. For an assistant scan of that model, the classifier messages are the latest user text, then the assistant text. A user-role scan stays a single user message. See [Optional Pipeline Layers](../integrations/optional-layers.md).

## Tests

`tests/test_llm.py` covers identity-scoped memory attach, injected-memory-only redaction, a split-address SSE body, and reservation release when the provider raises. `tests/test_pipeline.py` records the preflight order. `tests/test_nvidia.py` checks that an outbound content-safety scan sends `user` then `assistant`. `tests/test_billing.py` covers hold, settle, and release.
