# Security Policy

## Supported versions

Report vulnerabilities against the default branch. There is no long-term support
window yet; fixes land on `Master` and are expected to be pulled promptly.

## Reporting a vulnerability

Do not open a public issue for security reports.

Use GitHub Security Advisories for this repository, or email the maintainers
listed on the repository page. Include:

- the affected commit or tag
- a minimal reproduction
- impact (auth bypass, cost abuse, data leak, RCE)

You should receive an acknowledgement within 7 days. Please give us a reasonable
window to patch before public disclosure.

## Operator notes

- Inbound auth is fail-closed. Set `GATEWAY_API_KEY` (or issue keys) unless you
  explicitly set `GATEWAY_ALLOW_OPEN=1` for loopback-only work.
- Set `GATEWAY_KEY_PEPPER` when auth is on, when any issued key exists, and
  before a new key is hashed. That includes `GATEWAY_ALLOW_OPEN=1`. Open mode
  with an empty key file may still serve the legacy gateway key. Compose forces
  `GATEWAY_ALLOW_OPEN=0` and will not start without a pepper.
- Memory search, add, and delete use the authenticated key. A client `user_id`
  cannot read or delete another key's memories. Unknown or foreign ids return
  404.
- `WEB_CONCURRENCY` or `UVICORN_WORKERS` greater than 1 without `REDIS_URL`
  refuses to start. `GATEWAY_ALLOW_SPLIT_BUDGET=1` restores a warning. That
  hatch does not share the key file or `data/runtime-flags.json`. Supported
  topology is one worker, or Redis for cache, RPM, and the daily budget only.
- `GET /healthz` is public liveness. `GET /health` and `GET /ready` stay
  behind the `read` scope.
- Compose binds `127.0.0.1:8000` and forces `GATEWAY_ALLOW_OPEN=0`.
- Provider `*_API_KEY` values stay in `.env`. Do not put them in `NEXT_PUBLIC_*`.
  Operator policy lives in [`config/realmm.yaml`](config/realmm.yaml). Env
  overrides YAML.
