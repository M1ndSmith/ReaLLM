---
type: Configuration
title: Configuration and Runtime Flags
description: Secrets stay in the environment. Operator policy is YAML, env overrides YAML, and five layer flags can be patched at runtime. The NVIDIA preset names chat, embedder, and guard models.
tags: [configuration, yaml, env, runtime-flags, nvidia]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-27T22:14:48.530Z
sources:
  - id: openwiki-source-29917ce75b0d5babec26c3ce
    resource: repo://app/api/routes/config.py
  - id: openwiki-source-59efad31bc29fc75e7dba1c5
    resource: repo://app/infrastructure/flags.py
  - id: openwiki-source-e121e42c8bbea001634d580b
    resource: repo://app/infrastructure/router.py
  - id: openwiki-source-db0ec04dc9c2d403e1b7614e
    resource: repo://app/settings.py
  - id: openwiki-source-e201e686a785f09b6d899f0b
    resource: repo://compose.yaml
  - id: openwiki-source-cb7b64ac5490a877c9488251
    resource: repo://config/nvidia.yaml
  - id: openwiki-source-d95c6ba201846bc81d4f6fbe
    resource: repo://env/nvidia.env
generated: { by: "cursor", at: "2026-09-27T22:14:48.530Z" }
---

# Configuration and Runtime Flags

`GatewaySettings` loads sources in this order: constructor arguments, process environment, dotenv, `config/realmm.yaml` (or `REALMM_CONFIG`), file secrets, then field defaults. Earlier sources win, so an environment variable overrides the same value in YAML.

Provider API keys stay in the environment. The catalog reads `*_API_KEY` from `os.environ`. They are not policy fields. See [Provider Catalog](../integrations/providers.md).

## YAML

`config/realmm.yaml` holds rate limits, retries, cache, fallbacks, memory, PII, guards, and daily budget caps. The default file leaves memory, PII, and guards disabled and leaves daily caps unset. If the policy file is missing, the loader returns an empty mapping and field defaults apply.

`config/nvidia.yaml` is the NVIDIA preset. It sets the memory chat model to `nvidia_nim/nvidia/nemotron-3.5-lightning-30b-a3b`, the embedder to `nvidia/nemotron-3-embed-1b`, and both `guards.content_model` and `guards.injection_model` to `nvidia_nim/nvidia/nemotron-3.5-content-safety`. In that file memory and the content guard are on, and PII and the injection guard are off until a runtime flag turns them on. `env/nvidia.env` points `REALMM_CONFIG` at that file and leaves `NVIDIA_NIM_API_KEY` empty.

When the YAML mapping contains `injection_model`, that value is copied even if it is an empty string, which replaces the Groq Prompt Guard default. `embedding_dims` is copied when the key is present. Other embedder ids need that integer. The two known Nemotron embed ids do not. See [Optional Pipeline Layers](../integrations/optional-layers.md).

The router reads RPM, TPM, retries, cache, and fallbacks from settings. It does not read those values with its own `os.getenv` calls.

Host presets under `env/` set `REALMM_CONFIG` to a matching file under `config/`. Compose forces `GATEWAY_ALLOW_OPEN=0`, pins `WEB_CONCURRENCY` and `UVICORN_WORKERS` to 1, and sets `REDIS_URL` to `redis://redis:6379/0`.

## Runtime overlay

`RuntimeFlagStore` overlays `MEMORY`, `PII`, `GUARD`, `GUARD_INJECTION`, and `GUARD_CONTENT` from `data/runtime-flags.json`. It does not change `os.environ`. The overlay wins for those five booleans. `PATCH /config` requires the `config` scope and a configured gateway key, then writes that overlay. A flag file can keep a layer on after YAML says off. The store loads when the process starts.

`restart_for` names keys, Redis, budgets, `MEMORY_EMBEDDER`, and `PII_ENTITIES`. Those changes need a process restart. The flag file itself stays on the local process and is not shared through Redis. `data/` is gitignored.

See [Gateway Authentication](../api/authentication.md) for the pepper and [Reliability, Budget, and Health](reliability.md) for how budget settings are enforced.
