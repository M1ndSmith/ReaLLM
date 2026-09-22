import type { TelemetryErrorClass, TelemetryErrorOwner, TelemetryErrorStage } from "./types.js";
/**
 * A failure family paired with its detail, the two-level result of classifying a
 * raw error. `errorDetail` is the specific failure within the family, or undefined
 * when the family has no detail split or none could be read from the raw error.
 */
export interface ErrorClassification {
    /**
     * The closed-set failure family.
     */
    errorClass: TelemetryErrorClass;
    /**
     * The specific failure within the family, or undefined.
     *
     * @default undefined - the family has no detail split, or none was resolvable
     * from the raw error alone.
     */
    errorDetail?: string;
}
/**
 * Flattens a possibly-wrapped error into the chain of links to inspect, nearest
 * first: the error itself, then its `cause`, its single nested `error`, and any
 * `AggregateError.errors`. Read-only and cycle-safe: it only reads own properties,
 * never assigns, tracks visited objects, and stops at {@link MAX_UNWRAP_DEPTH}. The
 * original value is always the first link even when it is not an object (a thrown
 * string still gets classified), so callers see identical behavior for unwrapped
 * errors.
 *
 * @param error - The thrown value to flatten.
 * @returns The nearest-first list of links, at most {@link MAX_UNWRAP_DEPTH} long.
 */
export declare function unwrapErrorChain(error: unknown): unknown[];
/**
 * Maps a possibly-wrapped error to a closed {@link ErrorClassification}. Walks the
 * unwrap chain nearest-first and returns the first link that yields a named class,
 * so a provider error hidden inside a tool-error wrapper or an `AggregateError` is
 * recovered instead of collapsing into the residual. Returns `agent_error` only when
 * no link in the chain carries a recognizable signal. Never leaks the message: links
 * are read to test regexes in-process, but only an enum member is ever returned.
 */
export declare function classifyError(error: unknown): ErrorClassification;
/**
 * Best-effort extraction of an HTTP-ish status from a provider SDK error. Reads
 * the common shapes, including the nested `response.status` some clients use.
 */
export declare function extractStatus(error: unknown): number | undefined;
/**
 * The provider status read from the nearest link in the unwrap chain that exposes
 * one, or undefined. Lets a wrapped provider error still emit its numeric status even
 * when the top-level wrapper carries none.
 */
export declare function firstStatusInChain(error: unknown): number | undefined;
/**
 * The class an owned-family throw site declares about itself, passed to
 * {@link inStage} / {@link inStageSync} so the tag carries class and detail, not
 * just stage.
 */
export interface ErrorOrigin {
    /**
     * The failure family this throw site produces.
     */
    errorClass: TelemetryErrorClass;
    /**
     * The specific detail within the family (e.g. the pass name, or a registry id).
     *
     * @default undefined - the family has no detail split.
     */
    errorDetail?: string;
}
/**
 * Stamps just the pipeline `stage` onto `error` (first tag wins). The one call a
 * plain stage bracket uses; the class is left to the raw-error classifier.
 */
export declare function tagErrorStage(error: unknown, stage: TelemetryErrorStage): void;
/**
 * Runs `fn`, tagging any thrown error with `stage` (and, when `origin` is given,
 * the owned-family class and detail) before it propagates. The one call the run
 * pipeline uses to bracket a stage. Pass `origin` at an owned-family throw site so
 * the failure carries its class and detail from where it was thrown, not from a
 * message string.
 *
 * @param stage - The pipeline stage to tag on a throw.
 * @param fn - The work to run.
 * @param origin - The owned-family class and detail, when the throw site owns the
 *   classification.
 */
export declare function inStage<T>(stage: TelemetryErrorStage, fn: () => Promise<T>, origin?: ErrorOrigin): Promise<T>;
/**
 * Synchronous {@link inStage}, for the synchronous build steps (`createModel`,
 * `createDeepAgent`) that can throw before any promise is created.
 */
export declare function inStageSync<T>(stage: TelemetryErrorStage, fn: () => T, origin?: ErrorOrigin): T;
/**
 * The full telemetry description of a failure, ready to spread into the run facts.
 */
export interface ErrorTelemetry {
    /**
     * The closed-set failure family.
     */
    errorClass: TelemetryErrorClass;
    /**
     * The specific failure within the family, normalized against its allowlist, or
     * undefined.
     */
    errorDetail: string | undefined;
    /**
     * The pipeline stage the failure was tagged at, or undefined when uninstrumented.
     */
    errorStage: TelemetryErrorStage | undefined;
    /**
     * Who owns the fix, derived from (class, detail, stage).
     */
    errorOwner: TelemetryErrorOwner;
    /**
     * The provider's numeric status, or undefined. A bare integer.
     */
    httpStatus: number | undefined;
}
/**
 * The constructor name of `value`, but only if it is a bare identifier; otherwise
 * undefined. Reads the name through the prototype (not an own `constructor` property)
 * so a tampered own `constructor` cannot smuggle a value past the allowlist.
 * Non-objects have no constructor name and yield undefined. Gated by the shared
 * {@link isSafeErrorIdentifier}.
 *
 * @param value - The value to fingerprint.
 * @returns The allowlisted constructor name, or undefined.
 */
export declare function safeConstructorName(value: unknown): string | undefined;
/**
 * The `.name` property of `value`, but only if it is a bare identifier; otherwise
 * undefined. This is the identity a framework deliberately sets: LangChain's
 * `MiddlewareError.wrap` copies the inner error's `.name` up onto the wrapper, so
 * reading `.name` recovers the real failure's identity even when `constructor.name`
 * reports the envelope class. Gated by the shared {@link isSafeErrorIdentifier}.
 *
 * @param value - The value to fingerprint.
 * @returns The allowlisted `.name`, or undefined.
 */
export declare function safeErrorName(value: unknown): string | undefined;
/**
 * The allowlisted identifier of the innermost error in the unwrap chain, or
 * undefined. This is the one signal the residual `agent_error` bucket carries, so it
 * must name the real failure and not a wrapper: a framework envelope copies the inner
 * message but reports its own constructor, so fingerprinting the outermost link
 * collapses every distinct root cause to the wrapper's name. Each link is resolved by
 * {@link linkErrorName} (its deliberately-set `.name`, else its constructor), and the
 * deepest link that yields a name wins. Walking to the deepest link recovers the
 * actual failure's identity (e.g. the provider SDK's own error class) while the shared
 * {@link isSafeErrorIdentifier} allowlist keeps the anonymity envelope closed. Falls
 * back to the outermost allowlisted name when only the wrapper has one. The walk
 * reuses the read-only, cycle-safe {@link unwrapErrorChain}.
 *
 * @param error - The thrown value to fingerprint.
 * @returns The innermost allowlisted identifier, or undefined.
 */
export declare function innermostErrorName(error: unknown): string | undefined;
/**
 * The single call the failure path uses: class, detail, owner, stage, and status in
 * one object, ready to spread into the run facts. The class and detail come from the
 * origin tag when the throw site owned the classification (build/connector/okf/
 * checkpointer, or a tagged config/tool detail), otherwise from {@link classifyError}
 * walking the unwrap chain. The one exception is the `build_error/stream_open` tag:
 * that stage is the first provider round trip, so a failure there carrying a provider
 * signal is a disguised provider error and the raw classification wins over the tag
 * (see {@link streamOpenDisguisesProvider}). For the residual `agent_error` bucket the
 * detail is instead the innermost error's own name, the one signal that bucket
 * carries, read from the cause chain so a framework envelope like LangChain's
 * `MiddlewareError` does not collapse every root cause to the wrapper's name. The
 * detail is normalized against its family's allowlist (or the identifier allowlist for
 * `agent_error`), so an off-list value is dropped rather than emitted. Never leaks the
 * message.
 */
export declare function describeErrorForTelemetry(error: unknown): ErrorTelemetry;
