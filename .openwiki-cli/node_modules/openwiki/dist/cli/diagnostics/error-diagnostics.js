import { isSecretLikeKey, sanitizeDiagnosticText, } from "../../platform/diagnostics.js";
import { isDebugMode } from "../debug.js";
import { isDiagnosticValue, isRecord } from "../guards.js";
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
export function getErrorDiagnostics(error) {
    const diagnostics = [];
    const debugMode = isDebugMode();
    if (debugMode && error instanceof Error) {
        diagnostics.push({ label: "name", value: error.name }, { label: "message", value: sanitizeDiagnosticText(error.message) });
        if (error.stack) {
            diagnostics.push({
                label: "stack",
                value: truncateDiagnosticValue(sanitizeDiagnosticText(error.stack)),
            });
        }
        const messageStatus = error.message.match(/\b([45]\d{2})\b/)?.[1];
        if (messageStatus) {
            diagnostics.push({
                label: "httpStatusFromMessage",
                value: messageStatus,
            });
        }
    }
    if (!isRecord(error)) {
        return diagnostics;
    }
    addOpenRouterMetadataDiagnostics(diagnostics, error, "");
    addAttachedDebugDiagnostics(diagnostics, error, "");
    if (debugMode) {
        addSafeObjectDiagnostics(diagnostics, error, "");
        addSafeNestedDiagnostics(diagnostics, error, "cause");
        addSafeNestedDiagnostics(diagnostics, error, "error");
        addSafeNestedDiagnostics(diagnostics, error, "response");
    }
    return dedupeDiagnostics(diagnostics);
}
function addSafeNestedDiagnostics(diagnostics, value, key) {
    const nested = value[key];
    if (!isRecord(nested)) {
        return;
    }
    addSafeObjectDiagnostics(diagnostics, nested, key);
    addOpenRouterMetadataDiagnostics(diagnostics, nested, key);
    addAttachedDebugDiagnostics(diagnostics, nested, key);
}
function addSafeObjectDiagnostics(diagnostics, value, prefix) {
    for (const key of [
        "status",
        "statusCode",
        "statusText",
        "code",
        "type",
        "param",
        "request_id",
        "requestID",
        "lc_error_code",
    ]) {
        const property = value[key];
        if (isDiagnosticValue(property)) {
            diagnostics.push({
                label: prefix ? `${prefix}.${key}` : key,
                value: sanitizeDiagnosticText(String(property)),
            });
        }
    }
    addSafeHeaderDiagnostics(diagnostics, value.headers, prefix);
}
function addAttachedDebugDiagnostics(diagnostics, value, prefix) {
    const debugValue = value.openRouterDebug;
    if (debugValue === undefined || debugValue === null) {
        return;
    }
    diagnostics.push({
        label: prefix ? `${prefix}.openRouterDebug` : "openRouterDebug",
        value: formatDiagnosticMetadataValue(debugValue),
    });
}
function addOpenRouterMetadataDiagnostics(diagnostics, value, prefix) {
    const metadata = value.metadata;
    if (!isRecord(metadata)) {
        return;
    }
    for (const key of ["provider_name", "is_byok", "finish_reason"]) {
        const property = metadata[key];
        if (isDiagnosticValue(property)) {
            diagnostics.push({
                label: prefix ? `${prefix}.metadata.${key}` : `metadata.${key}`,
                value: sanitizeDiagnosticText(String(property)),
            });
        }
    }
    addMetadataValueDiagnostic(diagnostics, metadata, "raw", prefix);
    addPreviousErrorDiagnostics(diagnostics, metadata.previous_errors, prefix);
}
function addMetadataValueDiagnostic(diagnostics, metadata, key, prefix) {
    const value = metadata[key];
    if (value === undefined || value === null) {
        return;
    }
    diagnostics.push({
        label: prefix ? `${prefix}.metadata.${key}` : `metadata.${key}`,
        value: formatDiagnosticMetadataValue(value),
    });
}
function addPreviousErrorDiagnostics(diagnostics, previousErrors, prefix) {
    if (!Array.isArray(previousErrors)) {
        return;
    }
    previousErrors.slice(0, 5).forEach((previousError, index) => {
        diagnostics.push({
            label: prefix
                ? `${prefix}.metadata.previous_errors.${index}`
                : `metadata.previous_errors.${index}`,
            value: formatDiagnosticMetadataValue(previousError),
        });
    });
    if (previousErrors.length > 5) {
        diagnostics.push({
            label: prefix
                ? `${prefix}.metadata.previous_errors.more`
                : "metadata.previous_errors.more",
            value: `${previousErrors.length - 5} more previous provider errors`,
        });
    }
}
function formatDiagnosticMetadataValue(value) {
    if (isDiagnosticValue(value)) {
        return truncateDiagnosticValue(sanitizeDiagnosticText(String(value)));
    }
    return truncateDiagnosticValue(sanitizeDiagnosticText(safeStringify(value)));
}
function safeStringify(value) {
    try {
        return JSON.stringify(value, createDiagnosticJsonReplacer(), 2);
    }
    catch {
        return String(value);
    }
}
function createDiagnosticJsonReplacer() {
    const seen = new WeakSet();
    return (key, value) => {
        if (isSecretLikeKey(key)) {
            return "[REDACTED]";
        }
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    };
}
function truncateDiagnosticValue(value) {
    const maxLength = 2_000;
    const normalizedValue = value.trim();
    if (normalizedValue.length <= maxLength) {
        return normalizedValue;
    }
    return `${normalizedValue.slice(0, maxLength - 3)}...`;
}
function addSafeHeaderDiagnostics(diagnostics, headers, prefix) {
    if (!isRecord(headers)) {
        return;
    }
    for (const key of [
        "x-request-id",
        "request-id",
        "openai-processing-ms",
        "cf-ray",
    ]) {
        const value = getHeaderValue(headers, key);
        if (isDiagnosticValue(value)) {
            diagnostics.push({
                label: prefix ? `${prefix}.header.${key}` : `header.${key}`,
                value: sanitizeDiagnosticText(String(value)),
            });
        }
    }
}
function getHeaderValue(headers, key) {
    if (key in headers) {
        return headers[key];
    }
    const matchingKey = Object.keys(headers).find((headerKey) => headerKey.toLowerCase() === key);
    return matchingKey ? headers[matchingKey] : undefined;
}
function dedupeDiagnostics(diagnostics) {
    const seen = new Set();
    const deduped = [];
    for (const diagnostic of diagnostics) {
        const key = `${diagnostic.label}:${diagnostic.value}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(diagnostic);
    }
    return deduped;
}
