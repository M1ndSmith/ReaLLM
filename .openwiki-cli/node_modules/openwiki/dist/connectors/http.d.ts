/**
 * Shared resilient HTTP helper for connector ingestion.
 *
 * Every connector (Gmail, Slack, X, Hacker News) and the HTTP MCP client used to
 * call `fetch` directly with no timeout and no retry: any 429 or transient 5xx
 * aborted the whole run, and a non-responsive server hung ingestion forever.
 *
 * `fetchWithResilience` adds:
 *   - a per-request wall-clock timeout via `AbortSignal.timeout`,
 *   - bounded exponential backoff with jitter on 429 and 5xx responses,
 *     honoring a numeric or HTTP-date `Retry-After` header within the cap,
 *   - the same backoff on network errors (connection reset, DNS, timeout).
 *
 * Auth failures (401/403) and other 4xx are returned as-is: they are not
 * transient, and callers such as Gmail need to see a 401 to trigger a token
 * refresh. Retrying them would waste attempts and could lock accounts.
 */
export interface FetchWithResilienceOptions {
    /** Per-attempt timeout in milliseconds. Default 30s. */
    timeoutMs?: number;
    /** Number of retries after the first attempt. Default 3. */
    maxRetries?: number;
    /** Base delay for exponential backoff in milliseconds. Default 500ms. */
    baseDelayMs?: number;
    /**
     * Injectable sleep, defaulting to a real timer. Overridden in tests so
     * backoff does not slow the suite. Receives the delay in milliseconds.
     */
    sleep?: (ms: number) => Promise<void>;
    /**
     * Injectable RNG in [0, 1) for jitter. Defaults to `Math.random` for real
     * full jitter so concurrent clients de-correlate their retries. Override in
     * tests to pin exact delays.
     */
    random?: () => number;
}
/** Whether an HTTP status is worth retrying (rate limit or server error). */
export declare function isRetryableStatus(status: number): boolean;
/**
 * Parses a `Retry-After` header (delta-seconds or HTTP-date) into milliseconds,
 * or `null` when absent/unparseable. `now` is injectable for testing the
 * HTTP-date branch without a clock dependency.
 */
export declare function parseRetryAfterMs(headerValue: string | null, now?: number): number | null;
/**
 * `fetch` with a per-attempt timeout and bounded retry/backoff on transient
 * failures. Non-transient responses (2xx/3xx/4xx) are returned to the caller
 * unchanged after the first attempt.
 */
export declare function fetchWithResilience(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1], options?: FetchWithResilienceOptions): Promise<Response>;
