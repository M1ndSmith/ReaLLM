/** Base URL for the Codex Responses backend; the OpenAI SDK appends `/responses`. */
export declare const CODEX_RESPONSES_BASE_URL = "https://chatgpt.com/backend-api/codex";
/** Free-text client label sent as the `originator` header/param. */
export declare const CODEX_ORIGINATOR = "openwiki";
export declare const CODEX_RESPONSES_LITE_HEADER = "x-openai-internal-codex-responses-lite";
/**
 * Adapts requests for the ChatGPT-backed Codex endpoint at the final fetch
 * boundary. LangChain supplies its own user agent after merging configured
 * headers, while Luna is exposed only to the Codex request identity and uses
 * the Responses Lite request constraints.
 */
export declare function createCodexFetch(modelId: string, fetchImpl?: typeof fetch): typeof fetch;
/**
 * Refresh the access token when it is within this many milliseconds of expiry,
 * so a token does not lapse mid-run.
 */
export declare const CHATGPT_TOKEN_REFRESH_THRESHOLD_MS = 60000;
export interface CodexTokens {
    access: string;
    refresh: string;
    /** Absolute expiry time of the access token, in epoch milliseconds. */
    expiresAtMs: number;
    accountId: string;
    /** Signed-in account email, decoded from the token (best-effort). */
    email: string | null;
    /** ChatGPT plan (e.g. `plus`, `pro`, `team`), decoded from the token. */
    planType: string | null;
}
export interface ChatGptIdentity {
    accountId: string | null;
    email: string | null;
    planType: string | null;
}
/**
 * The single source of truth for how {@link CodexTokens} maps onto the
 * `~/.openwiki/.env` keys. Both the credential wizard and the agent's
 * refresh-at-startup write tokens through this, so the env contract lives next
 * to the type it serializes.
 */
export declare function codexTokensToEnv(tokens: CodexTokens): Record<string, string>;
/**
 * Reads persisted {@link CodexTokens} back out of the environment. Returns
 * `null` unless the three fields required to call the Codex backend (access
 * token, refresh token, account id) are all present.
 */
export declare function readCodexTokensFromEnv(env?: NodeJS.ProcessEnv): CodexTokens | null;
/** Formats an `email (Plan)` label from decoded ChatGPT identity claims. */
export declare function formatChatGptAccount(email: string | null, planType: string | null): string | null;
/** {@link formatChatGptAccount} for the identity persisted in the environment. */
export declare function formatChatGptAccountFromEnv(env?: NodeJS.ProcessEnv): string | null;
/**
 * Decodes identity claims from the access-token JWT: the mandatory
 * `chatgpt_account_id` (required for the Codex request header) plus the
 * best-effort `chatgpt_plan_type` and profile `email` used only for display.
 * No signature verification: these are our own credentials, read for our own
 * bookkeeping.
 */
export declare function decodeChatGptIdentity(accessToken: string): ChatGptIdentity;
/**
 * Runs the browser Authorization Code + PKCE login. `openUrl` is invoked once
 * the local callback server is listening: open a browser tab and/or print the
 * URL for headless use. Resolves with the exchanged tokens.
 */
export interface ChatGptLoginHandle {
    /**
     * Complete the login from a manually pasted value — either the full redirect
     * URL the browser landed on (`http://localhost:1455/auth/callback?code=…`) or
     * the bare `code`. Returns `null` on success, or a human-readable error string
     * if the input can't be used (so it can be shown inline without aborting).
     */
    submitManual(input: string): string | null;
}
/**
 * Extracts the `code`/`state` from a manually pasted value. Accepts a full
 * redirect URL, a bare query string (`code=…&state=…`), or a bare code.
 */
export declare function parseManualCallbackInput(input: string): {
    code: string | null;
    state: string | null;
};
export declare function loginWithChatGPT(openUrl: (url: string) => void, onReady?: (handle: ChatGptLoginHandle) => void): Promise<CodexTokens>;
/**
 * Exchanges a refresh token for a fresh access token. OpenAI may rotate the
 * refresh token, so callers must persist whatever `refresh` comes back.
 */
export declare function refreshChatGptTokens(refreshToken: string): Promise<CodexTokens>;
/**
 * Whether a token expiring at `expiresAtMs` should be refreshed now, accounting
 * for the near-expiry threshold.
 */
export declare function isChatGptTokenExpired(expiresAtMs: number, now?: number, thresholdMs?: number): boolean;
