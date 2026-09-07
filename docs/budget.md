# Cost, tokens, and budget

Chat counts tokens and USD with LiteLLM, then applies app-level caps. The LLM call still goes through the Router.

Pipeline order is in [architecture](architecture.md). Caps run after prompts, PII, memory, and inbound guards.

## What is counted

After named prompts are compiled, optional PII masking, and memory hits (if `MEMORY=1`), [`BudgetRuntime`](../app/infrastructure/budget.py) calls `litellm.token_counter` on the outgoing messages (tiktoken under the hood; no extra package). After the call, it reads provider `usage` and `litellm.completion_cost`. Models missing from LiteLLM's price map (many live Groq ids) return `cost_usd: null`. Token counts still apply.

JSON `POST /chat` includes `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`, `cost_usd`). Streams send the same on a final SSE event. Cache hits return usage but do not add to the daily ledger.

## Caps

| Knob | Default | When it rejects |
| --- | --- | --- |
| `MAX_OUTPUT_TOKENS` | `2048` | Always passed as `max_tokens` (stops runaway completions) |
| `MAX_INPUT_TOKENS` | unset | Prompt estimate over the cap → `400` |
| `DAILY_TOKEN_BUDGET` | unset | Estimate would pass the remaining daily tokens → `402` |
| `DAILY_USD_BUDGET` | unset | Priced-model input estimate would pass remaining USD → `402` |

Unset daily/input knobs mean report only. Daily window is the UTC calendar day.

## Ledger

- One worker: `data/budget-state.json` (gitignored via `data/`). A restart does not reset the day.
- `REDIS_URL` set: hash `realmm:budget:{utc-day}` with `tokens` / `usd`, TTL ~3 days. Required as soon as you run more than one uvicorn process; the JSON file is not shared.

If Redis is configured but unreachable, the process logs a warning and falls back to the file for that process. `GET /health` / `GET /budget` include `ledger`: `redis` or `file`.

## Inspect

`GET /budget` and `GET /health` (`budget`) show used vs limits.

## Out of scope

LiteLLM already uses tiktoken inside `token_counter`. A second tiktoken import would miss chat-template overhead. `acount_tokens` is extra provider HTTP; Groq has no count API. Router `provider_budget_config` / `max_budget` uses the incomplete price map, so Groq often costs $0 and never trips; when a provider is over budget the Router can fall back and spend elsewhere. Hard stop lives in this app. `litellm.BudgetManager` / `litellm.max_budget` is process-lifetime or hosted spend, not a UTC daily reset that matches this layer. LiteLLM Proxy spend DB / virtual keys need Postgres and a different gateway.
