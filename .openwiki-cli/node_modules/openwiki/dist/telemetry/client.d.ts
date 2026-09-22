import type { TelemetryEvent } from "./types.js";
/**
 * Sends one event with all minimal-collection flags set, awaiting the send
 * itself. Returns whether it actually sent (false when no key is configured).
 *
 * The send is `captureImmediate`, whose returned promise IS the single HTTP
 * request, awaited here (bounded by a timeout because the CLI is short-lived).
 * This is deliberately not the queued `capture()` + flush-on-`shutdown()` path:
 * that defers the send into a batch and can resolve `shutdown()` without the
 * event having landed, which silently drops events under load. Since the CLI
 * emits exactly one event per run and then exits, awaiting the immediate send is
 * both the simplest and the most reliable choice.
 */
export declare function capture(event: TelemetryEvent): Promise<boolean>;
