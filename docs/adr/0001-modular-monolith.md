# 0001. Layered modular monolith

## Status

Accepted.

## Context

ReaLMM is one FastAPI process in front of LiteLLM. The previous layout mixed HTTP routing, catalog, orchestration, and sidecar adapters in flat modules (`app/main.py`, `app/llm.py`) with module globals. The usual alternative is a full hexagonal/DI framework, or splitting providers, memory, and the console into separate services.

## Decision

Keep a single deployable gateway. Split the process into four layers wired by bootstrap:

- `app/api`: FastAPI adapters, auth, SSE/OpenAI encoding
- `app/application`: `ChatService` and ports (no FastAPI, LiteLLM, Mem0, Presidio, or Redis)
- `app/infrastructure`: stateful adapters (catalog, Router, budget, prompts, PII, memory, guards, flags)
- `app/bootstrap.py` / `app/container.py`: dotenv, settings, composition, lifespan

Use classes only where there is state, lifecycle, or an external adapter. Keep schema validation, SSE framing, and catalog matching as functions. Do not add a DI container, plugin registry, or per-provider adapter classes.

## Consequences

URLs, env names, Compose, and `uvicorn app.main:app` stay the same. Tests construct a `GatewayRuntime` instead of resetting module globals. Import ownership is enforced in `tests/test_architecture.py`.
