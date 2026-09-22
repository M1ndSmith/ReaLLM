import type { OpenWikiCommand, OpenWikiOutputMode } from "./types.js";
import { type OpenWikiContentSnapshot } from "./utils.js";
/**
 * Everything the crash guard needs to record and stamp an interrupted run
 * post-mortem, captured when a run starts. A run registers this on entry so that a
 * rejection escaping every catch can still be attributed to the run that caused it.
 */
export interface ActiveRunRecord {
    /**
     * Command of the in-flight run. Only init/update reach telemetry; chat is dropped
     * downstream by `recordRunSafe`, but the stamp still runs for it.
     */
    command: OpenWikiCommand;
    /**
     * Repo (or local-wiki) root the run writes into.
     */
    cwd: string;
    /**
     * Resolved model id, written into the interrupted stamp.
     */
    modelId: string;
    /**
     * Output mode; decides where the stamp lives and the recorded run's brain mode.
     */
    outputMode: OpenWikiOutputMode;
    /**
     * Content snapshot taken before the run; the stamp writes only if content changed
     * since.
     *
     * @default undefined - no snapshot was captured before the run (e.g. chat), so the
     * interrupted stamp is skipped.
     */
    snapshotBefore?: OpenWikiContentSnapshot;
    /**
     * Effective wiki language, preserved in the stamp.
     *
     * @default undefined - the run has no explicit wiki language; the stamp omits it.
     */
    language?: string;
}
/**
 * Registers the run the process is currently executing, so a fatal signal can
 * attribute the crash. Call once a run's pre-flight snapshot exists.
 *
 * @param record - The in-flight run's post-mortem facts.
 */
export declare function registerActiveRun(record: ActiveRunRecord): void;
/**
 * Clears the registration. Call in the run's `finally` so a clean run leaves no
 * stale record for a later crash to misattribute.
 */
export declare function clearActiveRun(): void;
/**
 * The registered run, or undefined when the process is idle.
 */
export declare function getActiveRun(): ActiveRunRecord | undefined;
/**
 * Shared post-mortem for both fatal signals. Best-effort throughout: the crash may
 * have destroyed state the recorder or stamper wants, so each side effect is wrapped
 * and swallowed independently, and the process still exits non-zero regardless.
 * Telemetry is awaited only so its flush has a chance to complete before the exit;
 * a failure in it never blocks the stamp or the exit.
 *
 * A rejection that reaches here would otherwise kill the process with a raw stack, no
 * stamp, and no telemetry. Recording it means an escaped runtime rejection finally
 * appears in the data, classified and (when residual) fingerprinted by the same
 * boundary as every other failure; stamping it `interrupted` means the next
 * scheduled update retries instead of no-opping against a half-written wiki.
 *
 * @param source - Which handler fired (`unhandledRejection`/`uncaughtException`);
 *   used only for the local stderr line.
 * @param error - The escaped rejection or exception.
 */
export declare function handleFatal(source: string, error: unknown): Promise<void>;
/**
 * Installs the last-resort handlers for rejections and exceptions that bypass every
 * catch in the run. Idempotent, and meant to be called once at CLI startup, before
 * any run begins.
 */
export declare function installCrashGuard(): void;
