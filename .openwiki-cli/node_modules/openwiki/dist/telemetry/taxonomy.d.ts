import type { TelemetryErrorClass, TelemetryErrorOwner, TelemetryErrorStage } from "./types.js";
/**
 * Whether `value` is a bare code identifier safe to emit: a string of at most 64
 * characters matching {@link SAFE_ERROR_IDENTIFIER}. The length bound caps how much a
 * single name can weigh and closes the door on a giant synthesized name. The one gate
 * every error identifier passes through before it can leave the process, whether it
 * is read from `.name`, `constructor.name`, or the residual `agent_error` detail.
 *
 * @param value - The candidate identifier, or any non-string value.
 * @returns True only for an allowlisted bare identifier.
 */
export declare function isSafeErrorIdentifier(value: unknown): value is string;
/**
 * Validates an observed `detail` against its family's allowlist, returning it only
 * when legal and undefined otherwise. This is the runtime guarantee behind the
 * detail property's anonymity: a fixed-family detail must be on the family's
 * hardcoded list; an open-family detail (connector/tool id) is trusted as a
 * non-empty string because its tag site already validated it against the registry;
 * the residual `agent_error` family carries the innermost error's own name as its
 * detail, so it accepts any bare identifier that passes {@link isSafeErrorIdentifier}
 * (not a fixed word list) and drops anything else; a no-detail family always yields
 * undefined.
 *
 * @param errorClass - The failure family the detail belongs to.
 * @param detail - The observed detail, or undefined when none was resolved.
 * @returns The detail if it is legal for the family, otherwise undefined.
 */
export declare function normalizeErrorDetail(errorClass: TelemetryErrorClass, detail: string | undefined): string | undefined;
/**
 * Derives who owns the fix for a failure from its class, detail, and stage. The
 * single source of owner truth; no other site should branch on (class, detail) to
 * decide an owner. Encodes the three cross-owner exceptions where a family sits
 * under one owner but a couple of its details are really someone else's problem:
 *
 * - `provider_error` is the provider's, except `auth`/`quota_exceeded` (the user's
 *   key or account) which are `environment`.
 * - `network_error` is the provider path's, except `dns`/`refused` (the user's
 *   machine or network) which are `environment`.
 * - `filesystem_error` is the user's, except at `finalize` (our own wiki write
 *   path) which is `openwiki`.
 *
 * @param errorClass - The failure family.
 * @param detail - The normalized detail, or undefined.
 * @param stage - The pipeline stage the failure was tagged at, or undefined.
 * @returns The owner responsible for acting on the failure.
 */
export declare function deriveOwner(errorClass: TelemetryErrorClass, detail: string | undefined, stage: TelemetryErrorStage | undefined): TelemetryErrorOwner;
