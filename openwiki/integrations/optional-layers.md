---
type: Optional layers
title: Optional Pipeline Layers
description: Memory, PII, guards, and prompts are optional. Memory and guard spend follow the authenticated key. Embedder ids and Nemotron content safety are selected by policy.
tags: [memory, pii, guards, prompts, nvidia]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-27T22:14:48.530Z
sources:
  - id: openwiki-source-bdfcb6714146f50144a89001
    resource: repo://app/api/routes/memory.py
  - id: openwiki-source-c408e90cd85dd093896698de
    resource: repo://app/infrastructure/guards.py
  - id: openwiki-source-0a97995f7bc8c67bb27b072e
    resource: repo://app/infrastructure/memory.py
  - id: openwiki-source-a53a5ed686ce2105af1166ee
    resource: repo://app/infrastructure/prompts.py
  - id: openwiki-source-db0ec04dc9c2d403e1b7614e
    resource: repo://app/settings.py
  - id: openwiki-source-cb7b64ac5490a877c9488251
    resource: repo://config/nvidia.yaml
generated: { by: "cursor", at: "2026-09-27T22:14:48.530Z" }
---

# Optional Pipeline Layers

Memory, PII, guards, and remote prompts are off unless policy or a runtime flag turns them on. Guard and Mem0 extractor calls use the same `CompletionBackend` as chat. Their token counts are recorded with the caller `identity_id`. See [Chat Pipeline](../architecture/chat-pipeline.md) and [Provider Catalog](providers.md).

## Memory

Chat attach searches with `include_run=False`. `conversation_id` is stored as Mem0 `run_id` on add, but fact search does not filter on it. The Mem0 `user_id` is whatever the caller passed into memory methods. Chat and the memory HTTP routes pass `bound_identity_id`, not the client `user_id`. A blank id is stored as `local` by `resolve_scope`. Facts written under `local` are not returned for a real key id.

`GET /memory` and `POST /memory` ignore a client `user_id`. `DELETE /memory/{id}` loads the record and raises if its owner is not the caller. The route maps that `ValueError` to `404`.

`POST /memory` runs the content guard on the write when that layer is on. Background `schedule_record` after chat does not call that guard. Extractor completions set `RouterLLM.identity_id` before Mem0 runs, so those tokens bill the same identity. The extractor uses the configured `memory.llm_model` when it resolves, with temperature `0.1` and `max_tokens` 512.

### Embedders

`fastembed` is 384-dimensional (`BAAI/bge-small-en-v1.5`). `openai` is 1536-dimensional (`text-embedding-3-small`) and requires `OPENAI_API_KEY`. Any other non-empty embedder id is kept as written. `nvidia/nemotron-3-embed-1b` and `nvidia_nim/nvidia/nemotron-3-embed-1b` use 2048 dimensions and `LiteLLMEmbedder` with `input_type` `passage` on add and update, and `query` on search. Other ids also use `LiteLLMEmbedder`, and they require `memory.embedding_dims` because the Qdrant collection size is fixed at build time. The NVIDIA preset names the Nemotron embedder. See [Configuration and Runtime Flags](../operations/configuration.md).

## PII and guards

PII redacts prompts before the provider call and redacts memory hits on read. Memories written while PII was off can still contain raw text until a later read redacts them. When PII is on, streamed assistant text is held and redacted once. That behavior is in the chat pipeline page.

Guard classification records usage with the `identity_id` passed into `assert_inbound`, `assert_outbound`, and `assert_memory_write`. A guard call that fails to return text raises `GuardConfigError`. A blocked classification raises `GuardBlockedError`.

`requested_injection_model` returns the configured injection model with no Groq fallback. An empty value, or an id missing from the catalog, raises `GuardConfigError` telling the operator to set `guards.injection_model` to a catalog id. `requested_content_model` falls back to `groq/meta-llama/llama-guard-4-12b` only when the content model setting is empty.

A model id that contains `content-safety` is classified as Nemotron content safety. Those calls send `chat_template_kwargs` with `enable_thinking` false and `request_categories` `/categories`, and they cap the classifier at 128 tokens. Injection then reads `User Safety`. An unsafe user verdict raises `GuardBlockedError` with scanner `injection`. Content reads `User Safety` for a user turn and `Response Safety` for an assistant turn, and an unsafe verdict raises scanner `content`. Prompt Guard and Llama Guard parsing still apply when the verdict is not a Nemotron safety block. The NVIDIA preset points both `injection_model` and `content_model` at `nvidia_nim/nvidia/nemotron-3.5-content-safety`.

## Prompts

If remote prompts are enabled, the source is Langfuse. Otherwise local files under `prompts/` are used when they exist. Tracing, when on, appends the `langfuse_otel` LiteLLM callback. Named prompts are optional. A request can send messages only.
