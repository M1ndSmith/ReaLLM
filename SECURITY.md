# Security Policy

## Supported versions

Report vulnerabilities against the default branch. There is no long-term support
window yet; fixes land on `main` and are expected to be pulled promptly.

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
- When auth is on, set `GATEWAY_KEY_PEPPER`. Compose forces
  `GATEWAY_ALLOW_OPEN=0` and will not start without a pepper.
- `GET /healthz` is public liveness. `GET /health` and `GET /ready` stay
  behind the `read` scope.
- Compose binds `127.0.0.1:8000` and forces `GATEWAY_ALLOW_OPEN=0`.
- Provider `*_API_KEY` values stay in `.env`. Do not put them in `NEXT_PUBLIC_*`.
- See [`.env.example`](.env.example) for the full control surface.
