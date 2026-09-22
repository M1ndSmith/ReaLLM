/**
 * Redacts secrets from text before it is shown to the user or written to a log.
 *
 * This is a security boundary: any error message, header value, or provider
 * response body that could contain a credential must pass through here first.
 * It removes (1) the exact values of secrets currently set in the environment
 * and (2) anything matching known key/token shapes (OpenAI/OpenRouter `sk-…`,
 * `Bearer …`, LangSmith `ls…`, and "Incorrect API key provided: …" phrasing).
 */
export declare function sanitizeDiagnosticText(value: string): string;
/**
 * True when an object key name looks like it holds a credential, so its value
 * should be redacted before display, logging, or persistence.
 *
 * This is a security boundary shared by every redaction path (diagnostics,
 * OpenRouter response bodies, and MCP tool args/results). The term list is the
 * union of every term the individual paths previously matched, so a key
 * redacted by one path is redacted by all of them.
 */
/**
 * The union of every substring that marks a key/field name as secret-bearing.
 * Single source of truth for all redaction paths — extend this, not the
 * individual call sites.
 */
export declare const SECRET_KEY_PATTERN_SOURCE = "api[-_]?key|authorization|bearer|token|secret|password|user_id|cookie";
export declare function isSecretLikeKey(key: string): boolean;
/**
 * Recognizes an OpenRouter/provider 500 response so a friendlier, actionable
 * message can be shown instead of a raw stack trace.
 */
export declare function isOpenRouterServerError(error: unknown, message: string): boolean;
/**
 * Produces a user-facing error message: a friendly note for provider 500s,
 * otherwise the error's own message with any secrets redacted.
 */
export declare function getErrorMessage(error: unknown): string;
/**
 * Whether a run failure looks like a credential rejection, judged from the HTTP
 * status (401/403, number or string) and the already-redacted message. Drives
 * whether the CLI shows the auth "how to fix" panel.
 */
export declare function isAuthError(error: unknown, message: string): boolean;
