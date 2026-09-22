---
type: Provider catalog
title: Provider Catalog
description: Non-empty provider API keys decide which models GET /models lists, and chat requests must use one of those ids.
tags: [providers, catalog, ollama, models]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T20:59:37.438Z
sources:
  - id: openwiki-source-edfc78d1c541ab16261576a4
    resource: repo://app/api/routes/openai.py
  - id: openwiki-source-5d4301d5bddc4e10f57a67d2
    resource: repo://app/infrastructure/catalog.py
generated: { by: "cursor", at: "2026-09-22T20:59:37.438Z" }
---

# Provider Catalog

`ProviderCatalog.detected_providers` keeps a LiteLLM provider only when `PROVIDER_API_KEY` or the underscored form is set to a non-empty string. Keys are read from the process environment, not from YAML. Ollama is included when `OLLAMA_API_KEY` is non-empty, which is how a local daemon is selected without a hosted secret. The host preset uses a dummy value for that variable.

`GET /models` lists the rebuilt catalog. Each row is a `provider/model` id. `resolve_model` returns the single exact id, or the single suffix match. No detected providers, an unknown id, or more than one match raises `UnknownModelError`. Callers should send an id from `GET /models`.

`POST /v1/embeddings` resolves the requested id through the same catalog, then calls the router. It does not add a separate embedding catalog.

Empty-key providers stay out of the catalog even if a YAML preset names their models. See [Configuration and Runtime Flags](../operations/configuration.md).
