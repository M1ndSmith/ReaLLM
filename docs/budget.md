# Cost, tokens, and budget

Chat counts tokens and USD with LiteLLM, then applies app-level caps. The LLM call still goes through the Router. This is not LiteLLM Proxy spend tracking and not Router USD budget routing.

## What is counted

After named prompts are compiled, optional PII masking, and memory hits (if `MEMORY=1`), [`app/budget.py`](../app/budget.py) calls `litellm.token_counter` on the outgoing messages (tiktoken under the hood; no extra package). After the call, it reads provider `usage` and `litellm.completion_cost`. Models missing from LiteLLM’s price map (many live Groq ids) return `cost_usd: null`. Token counts still apply.

JSON `POST /chat` includes `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`, `cost_usd`). Streams send the same on a final SSE event. Cache hits return usage but do not add to the daily ledger.

## Caps

| Knob | Default | When it rejects |
| --- | --- | --- |
| `MAX_OUTPUT_TOKENS` | `2048` | Always passed as `max_tokens` (stops runaway completions) |
| `MAX_INPUT_TOKENS` | unset | Prompt estimate over the cap → `400` |
| `DAILY_TOKEN_BUDGET` | unset | Estimate would pass the remaining daily tokens → `402` |
| `DAILY_USD_BUDGET` | unset | Priced-model input estimate would pass remaining USD → `402` |

Unset daily/input knobs mean **report only**. Daily window is the UTC calendar day.

## Ledger

- **One worker:** `data/budget-state.json` (gitignored via `data/`). A restart does not reset the day.
- **`REDIS_URL` set:** hash `realmm:budget:{utc-day}` with `tokens` / `usd`, TTL ~3 days. Required as soon as you run more than one uvicorn process; the JSON file is not shared.

If Redis is configured but unreachable, the process logs a warning and falls back to the file for that process. `GET /health` / `GET /budget` include `ledger`: `redis` or `file`.

## Inspect

`GET /budget` and `GET /health` (`budget`) show used vs limits.

## Do not stack extra libraries

Keep LiteLLM as the only tokenizer and price table.

- **tiktoken:** LiteLLM already uses it inside `token_counter`. A second import would miss chat-template overhead and drift from Router counts.
- **`acount_tokens`:** Extra provider HTTP for OpenAI/Anthropic/Gemini. Groq has no count API, so it falls back to local counting anyway.
- **LiteLLM Proxy spend DB / virtual keys:** That product needs Postgres and a gateway. This app calls `router.acompletion`.
- **Router `provider_budget_config` / `max_budget`:** USD via the incomplete price map, so Groq often costs $0 and never trips. When a provider is “over budget”, the Router falls back to other models and can spend there instead. Hard stop lives in the app, not in routing.
- **`litellm.BudgetManager` / `litellm.max_budget`:** Process-lifetime or `user_cost.json` / hosted `api.litellm.ai`. No UTC daily reset that matches this layer.
