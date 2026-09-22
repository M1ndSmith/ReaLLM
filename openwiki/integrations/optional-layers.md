---
type: Optional layers
title: Optional Pipeline Layers
description: Memory, PII, guards, and prompts are optional. Memory and guard spend follow the authenticated key.
tags: [memory, pii, guards, prompts]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T20:59:37.438Z
sources:
  - id: openwiki-source-bdfcb6714146f50144a89001
    resource: repo://app/api/routes/memory.py
  - id: openwiki-source-c408e90cd85dd093896698de
    resource: repo://app/infrastructure/guards.py
  - id: openwiki-source-0a97995f7bc8c67bb27b072e
    resource: repo://app/infrastructure/memory.py
  - id: openwiki-source-a53a5ed686ce2105af1166ee
    resource: repo://app/infrastructure/prompts.py
generated: { by: "cursor", at: "2026-09-22T20:59:37.438Z" }
---

# Optional Pipeline Layers

Memory, PII, guards, and remote prompts are off unless policy or a runtime flag turns them on. Guard and Mem0 extractor calls use the same `CompletionBackend` as chat. Their token counts are recorded with the caller `identity_id`. See [Chat Pipeline](../architecture/chat-pipeline.md).

## Memory

Chat attach searches with `include_run=False`. `conversation_id` is stored as Mem0 `run_id` on add, but fact search does not filter on it. The Mem0 `user_id` is whatever the caller passed into memory methods. Chat and the memory HTTP routes pass `bound_identity_id`, not the client `user_id`. A blank id is stored as `local` by `resolve_scope`. Facts written under `local` are not returned for a real key id.

`GET /memory` and `POST /memory` ignore a client `user_id`. `DELETE /memory/{id}` loads the record and raises if its owner is not the caller. The route maps that `ValueError` to `404`.

`POST /memory` runs the content guard on the write when that layer is on. Background `schedule_record` after chat does not call that guard. Extractor completions set `RouterLLM.identity_id` before Mem0 runs, so those tokens bill the same identity.

## PII and guards

PII redacts prompts before the provider call and redacts memory hits on read. Memories written while PII was off can still contain raw text until a later read redacts them. When PII is on, streamed assistant text is held and redacted once. That behavior is in the chat pipeline page.

Guard classification records usage with the `identity_id` passed into `assert_inbound`, `assert_outbound`, and `assert_memory_write`. A guard call that fails to return text raises `GuardConfigError`. A blocked classification raises `GuardBlockedError`.

## Prompts

If remote prompts are enabled, the source is Langfuse. Otherwise local files under `prompts/` are used when they exist. Tracing, when on, appends the `langfuse_otel` LiteLLM callback. Named prompts are optional. A request can send messages only.
