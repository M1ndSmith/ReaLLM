# Files

- [Optional Pipeline Layers](optional-layers.md) - Memory, PII, guards, and prompts are optional. Memory and guard spend follow the authenticated key. Embedder ids and Nemotron content safety are selected by policy.
- [Provider Catalog](providers.md) - Non-empty provider API keys decide which models GET /models lists. NVIDIA_API_KEY fills NVIDIA_NIM_API_KEY when that variable is empty. Chat fallbacks skip non-chat ids.
