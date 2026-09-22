---
type: Security boundary
title: Gateway Authentication
description: Fail-closed inbound auth, the peppered key store, scopes, and how open mode still serves a legacy gateway key when no issued keys exist.
tags: [authentication, gateway, keys, scopes]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T20:59:37.438Z
sources:
  - id: openwiki-source-1a98b5004c773391f6b97056
    resource: repo://app/api/app.py
  - id: openwiki-source-3af212cb777f7fe871c163b0
    resource: repo://app/api/auth.py
  - id: openwiki-source-b94fbb20abf7ef5f2d49dab4
    resource: repo://app/api/dependencies.py
  - id: openwiki-source-308fbb178a333ad189eacc81
    resource: repo://app/api/routes/admin.py
  - id: openwiki-source-f739a7216051b6f3d7707c10
    resource: repo://app/container.py
  - id: openwiki-source-c28551f669b931e2bd19a260
    resource: repo://app/infrastructure/identities.py
generated: { by: "cursor", at: "2026-09-22T20:59:37.438Z" }
---

# Gateway Authentication

Inbound calls are authenticated before they reach chat, memory, config, or admin handlers. The root router is mounted outside that dependency. Everything else sits on a router that depends on `require_gateway_auth`.

See [HTTP API Surface](http-surface.md) for which paths are public, and [Configuration and Runtime Flags](../operations/configuration.md) for where the pepper and gateway key are set.

## When a request is accepted

`require_gateway_auth` clears `request.state.gateway_identity`, then branches on `auth_enabled()`.

When auth is on, a missing `Authorization: Bearer` or `X-Api-Key` value is `401` with `gateway_unauthorized`. The same status is returned when `GatewayIdentityStore.resolve` does not accept the secret. A match binds the identity onto the request and into the logging context.

When auth is off and `GATEWAY_API_KEY` is empty, the function returns and leaves the identity unset. When auth is off but a gateway key is configured, the presented secret is compared with `hmac.compare_digest` against that key. A match may still bind a stored identity if `resolve` finds one.

`auth_enabled()` is true when multi-key mode is off and a gateway key is set, or when multi-key mode is on and either an unrevoked record exists or a gateway key is set.

`GatewayRuntime.start` refuses to boot if auth is off and `GATEWAY_ALLOW_OPEN` is not on. If auth is on and open mode is off, startup also refuses an empty pepper. Open mode with auth off logs a warning that anyone who can reach the port can call the API.

## Pepper and stored keys

Issued secrets are not stored. `create` hashes `pepper`, a NUL byte, and the secret with SHA-256 and keeps `sha256:<hex>`. Verification recomputes that digest and compares it with `hmac.compare_digest`. This is not a slow password hash.

`load` raises if the key file already contains records and `GATEWAY_KEY_PEPPER` is empty. `create` raises before hashing when the pepper is empty. Both checks apply when `GATEWAY_ALLOW_OPEN=1`.

If the file has no records and open mode is on, `_pepper` can fall back so a process with no issued keys still starts. `ensure_bootstrap_default` does not write the legacy key into the file in that case. `resolve` can still accept `GATEWAY_API_KEY` by a direct compare and return the identity id `default` with every scope. Do not rely on the empty-pepper fallback once any key record exists.

The store is a JSON file (`version`, `keys`) guarded by a process `RLock`. It is not shared across workers.

## Scopes and admin issuance

`require_scopes` reads the bound identity. If auth is on and no identity is bound, the result is `401`. If the identity's scopes are disjoint from the required set, the result is `403` with `required_scope` set to the first required name. If auth is off and no identity is bound, the scope check returns.

Valid scope names are `read`, `chat`, `config`, and `admin`. Unknown names are dropped. Creating a key with no remaining scope is `400`.

`GET`, `POST`, and `PATCH /admin/keys`, and `DELETE /admin/keys/{key_id}`, all require `admin`. Create returns the secret once. List and patch responses use the public identity shape and do not include the hash. Delete revokes the key.

The bootstrap record for `GATEWAY_API_KEY`, when a pepper is set and the file is empty, is stored as id `default` with all four scopes.

## Tests

`tests/test_auth.py`, `tests/test_scopes.py`, and `tests/test_admin_keys.py` cover unauthorized calls, scope denial, and key create/revoke. Pepper refusal with an existing key file under open mode is covered in `tests/test_identities.py`.
