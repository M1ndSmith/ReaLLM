# Cost, tokens, and budget

Chat counts tokens and USD with LiteLLM, then applies app-level caps. The LLM call still goes through the Router.

Pipeline order is in [architecture](architecture.md). Caps run after prompts, PII, memory, and inbound guards.

## What is counted

After named prompts are compiled, optional PII masking, and memory hits (if `MEMORY=1`), [`BudgetRuntime`](../app/infrastructure/budget.py) calls `litellm.token_counter` on outgoing messages (tiktoken under the hood; no extra package). After the call, it reads provider `usage` and `litellm.completion_cost`. Models missing from LiteLLM's price map (many live Groq ids) return `cost_usd: null`. Token counts still apply.

JSON `POST /chat` includes `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`, `cost_usd`). Streams send the same on a final SSE event. Cache hits return usage but do not add to the daily ledger.

## Caps

| Knob | Default | When it rejects |
| --- | --- | --- |
| `MAX_OUTPUT_TOKENS` | `2048` | Always passed as `max_tokens` (stops runaway completions) |
| `MAX_INPUT_TOKENS` | unset | Prompt estimate over the cap → `400` |
| `DAILY_TOKEN_BUDGET` | unset | Estimate would pass the remaining daily tokens → `402` |
| `DAILY_USD_BUDGET` | unset | Priced-model input estimate would pass remaining USD → `402` |

Unset daily/input knobs mean report only. Daily window is the UTC calendar day.

## Per-identity quotas

Each inbound key can set `daily_token_budget`, `daily_usd_budget`, and `rpm` on create or patch. Chat admission reads those via `quotas_for`, then [`BudgetRuntime.assert_allowed`](../app/infrastructure/budget.py) and `assert_rpm`. Unset identity quotas mean no extra cap beyond the process knobs above.

Identity token/USD overage is HTTP 402 (same as the process daily cap). Identity RPM overage is HTTP 429. That 429 is from this app layer, not Router provider RPM in [reliability](reliability.md).

## Ledger

- One worker: `data/budget-state.json` (gitignored via `data/`). A restart does not reset the day. Per-key spend is an `identities` map on that file.
- `REDIS_URL` set: hash `realmm:budget:{utc-day}` with `tokens` / `usd`, TTL ~3 days. Per-key hashes are `realmm:budget:{utc-day}:id:{slug}`. Required as soon as you run more than one uvicorn process; the JSON file is not shared.

If Redis is configured but unreachable, the process logs a warning and falls back to the file for that process. `GET /health` and `GET /budget` include `ledger`: `redis` or `file`.

## Inspect

`GET /budget` and `GET /health` (`budget`) show used vs limits.

## Out of scope

- A second tiktoken import. LiteLLM already uses tiktoken inside `token_counter`, and a separate count path can miss chat-template overhead.
- `acount_tokens`. It adds provider HTTP and Groq has no count API.
- Router `provider_budget_config` / `max_budget` for hard caps. It depends on an incomplete price map, so Groq often costs `$0` and may not trip. If one provider is over budget, Router fallback can still spend elsewhere.
- `litellm.BudgetManager` / `litellm.max_budget` for this daily cap. Those represent process-lifetime or hosted spend, not this layer's UTC daily reset.
- LiteLLM Proxy spend DB / virtual keys. That path needs Postgres and a different gateway.

Hard budget stop remains in this app layer.
