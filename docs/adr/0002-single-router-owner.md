# 0002. Single LiteLLM Router owner

## Status

Accepted.

## Context

User chat, Prompt Guard / Llama Guard classifiers, and Mem0 fact extraction all need provider completions. A second HTTP client, LiteLLM Proxy, or `litellm.completion` beside the Router would skip retries, fallbacks, cache, RPM/TPM, and traces.

## Decision

`LiteLLMRouterRuntime` in `app/infrastructure/router.py` is the only module allowed to instantiate `litellm.Router` or assign `litellm.cache`. Every completion goes through that runtime's `acompletion` / `completion` (`CompletionBackend`). Guards and Mem0 receive the backend. They do not construct a Router.

Do not add LiteLLM Proxy, virtual keys, Instructor reask, Outlines/Guidance, Letta, or a second path to providers.

## Consequences

Fallback, cache, and rate-limit policy stay in one place. Architecture tests fail if another module imports `litellm.Router` or mutates `litellm.cache`. Native `/chat` and OpenAI `/v1` are encoders over the same `ChatService`, which is the only caller of the backend for user chat.
