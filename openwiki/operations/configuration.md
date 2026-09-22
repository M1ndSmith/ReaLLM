---
type: Configuration
title: Configuration and Runtime Flags
description: Secrets stay in the environment. Operator policy is YAML, env overrides YAML, and five layer flags can be patched at runtime.
tags: [configuration, yaml, env, runtime-flags]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T20:59:37.438Z
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
generated: { by: "cursor", at: "2026-09-22T20:59:37.438Z" }
---

# Configuration and Runtime Flags

`GatewaySettings` loads sources in this order: constructor arguments, process environment, dotenv, `config/realmm.yaml` (or `REALMM_CONFIG`), file secrets, then field defaults. Earlier sources win, so an environment variable overrides the same value in YAML.

Provider API keys stay in the environment. The catalog reads `*_API_KEY` from `os.environ`. They are not policy fields.

## YAML

`config/realmm.yaml` holds rate limits, retries, cache, fallbacks, memory, PII, guards, and daily budget caps. The default file leaves memory, PII, and guards disabled and leaves daily caps unset. If the policy file is missing, the loader returns an empty mapping and field defaults apply.

The router reads RPM, TPM, retries, cache, and fallbacks from settings. It does not read those values with its own `os.getenv` calls.

Host presets under `env/` set `REALMM_CONFIG` to a matching file under `config/`. Compose forces `GATEWAY_ALLOW_OPEN=0`.

## Runtime overlay

`RuntimeFlagStore` overlays `MEMORY`, `PII`, `GUARD`, `GUARD_INJECTION`, and `GUARD_CONTENT` from `data/runtime-flags.json`. It does not change `os.environ`. `PATCH /config` requires the `config` scope and a configured gateway key, then writes that overlay. A flag file can keep a layer on after YAML says off.

`restart_for` names keys, Redis, budgets, `MEMORY_EMBEDDER`, and `PII_ENTITIES`. Those changes need a process restart. The flag file itself stays on the local process and is not shared through Redis.

See [Gateway Authentication](../api/authentication.md) for the pepper and [Reliability, Budget, and Health](reliability.md) for how budget settings are enforced.
