/**
 * A single allowlisted, non-secret field extracted from an error for the debug
 * diagnostics panel: a human-readable `label` and its already-sanitized
 * `value`. Never carries raw secret material; values pass through
 * `sanitizeDiagnosticText` and secret-like keys are redacted before they reach
 * here.
 */
export interface ErrorDiagnostic {
    /**
     * Dotted path describing where the value came from (e.g. `response.status`,
     * `header.x-request-id`).
     */
    label: string;
    /**
     * The sanitized, display-safe value.
     */
    value: string;
}
/**
 * Extracts a deduped list of allowlisted, non-secret diagnostic fields from an
 * arbitrary (often untrusted) error object for the `--debug` diagnostics panel.
 * Only known-safe keys are read; every value is sanitized and secret-like keys
 * are redacted, so raw secret material never leaves. In debug mode this
 * includes the error's stack, sanitized and truncated like every other
 * long value. Walks the error, its
 * OpenRouter metadata, any attached debug payload, and (in debug mode) its
 * `cause`/`error`/`response` nesting.
 */
export declare function getErrorDiagnostics(error: unknown): ErrorDiagnostic[];
