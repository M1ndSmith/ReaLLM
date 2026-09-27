---
type: Provider catalog
title: Provider Catalog
description: Non-empty provider API keys decide which models GET /models lists. NVIDIA_API_KEY fills NVIDIA_NIM_API_KEY when that variable is empty. Chat fallbacks skip non-chat ids.
tags: [providers, catalog, ollama, nvidia, models]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-27T22:14:48.530Z
sources:
  - id: openwiki-source-edfc78d1c541ab16261576a4
    resource: repo://app/api/routes/openai.py
  - id: openwiki-source-5d4301d5bddc4e10f57a67d2
    resource: repo://app/infrastructure/catalog.py
generated: { by: "cursor", at: "2026-09-27T22:14:48.530Z" }
---

# Provider Catalog

`ProviderCatalog.detected_providers` keeps a LiteLLM provider only when `PROVIDER_API_KEY` or the underscored form is set to a non-empty string. Keys are read from the process environment, not from YAML. Before that scan, `promote_nvidia_nim_key` copies a non-empty `NVIDIA_API_KEY` into `NVIDIA_NIM_API_KEY` when the NIM variable is empty. A NIM key that is already set is left alone. Ollama is included when `OLLAMA_API_KEY` is non-empty, which is how a local daemon is selected without a hosted secret. The host preset uses a dummy value for that variable.

`nvidia_nim` uses `NVIDIA_NIM_API_BASE` when set, otherwise `https://integrate.api.nvidia.com/v1`. The catalog tries that provider's OpenAI-compatible `/models` list first, then LiteLLM's live list, then the static provider table. Each row is a `provider/model` id. The list is cached for 60 seconds.

`GET /models` lists the rebuilt catalog, including embedders and safety models. `is_chat_model` is false when the id contains `whisper`, `tts`, `orpheus`, `prompt-guard`, `llama-guard`, `content-safety`, or `-embed-`. Fallback selection and the automatic memory chat-model pick skip those ids. `resolve_model` still accepts them when the caller names one.

`resolve_model` returns the single exact id, or the single suffix match. No detected providers, an unknown id, or more than one match raises `UnknownModelError`. Callers should send an id from `GET /models`.

`POST /v1/embeddings` resolves the requested id through the same catalog, then calls the router. It does not add a separate embedding catalog.

Empty-key providers stay out of the catalog even if a YAML preset names their models. See [Configuration and Runtime Flags](../operations/configuration.md) and [Optional Pipeline Layers](optional-layers.md).
