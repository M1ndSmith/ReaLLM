import type { BuildChannel, RunTelemetry, TelemetryEvent } from "./types.js";
/**
 * Environment and identity inputs that are not part of a run's own facts:
 * whether this is a CI run, whether it is the published build, and the identity
 * the event is attributed to. In production `recordRun` derives these from the
 * live process; the telemetry seed script supplies synthetic values. Keeping
 * them as explicit inputs is what lets both callers produce identically-shaped
 * events from the one builder below.
 */
export interface RunEventContext {
    /**
     * True for CI/scheduled runs. Drives the `ci` split, the person-profile flag,
     * and (via the caller) the sentinel identity.
     */
    ci: boolean;
    /**
     * True when the event represents the published `dist/` build rather than a
     * dev/source or seed run.
     */
    production: boolean;
    /**
     * The distribution channel this build was produced for (see
     * {@link BuildChannel}). Baked at build time, so the caller resolves it (via
     * `buildChannel()`) and the builder stays pure. Stamped on every event so
     * fork-originated telemetry can be separated from the official-release signal.
     */
    buildChannel: BuildChannel;
    /**
     * Identity the event is attributed to: an install id (human) or the CI
     * sentinel. The builder does not resolve this; the caller decides.
     */
    distinctId: string;
    /**
     * OpenWiki version from the bundled `package.json` (e.g. "0.2.3"). Stamped on
     * every event so adoption and per-version breakage are readable, and so the
     * dashboard can scope metrics to a known version. Resolved by the caller from
     * disk; the builder stays pure.
     *
     * @default undefined - the bundled package.json could not be read or had no
     * version; the field is omitted rather than sent empty.
     */
    appVersion?: string;
}
/**
 * The single source of truth for the `openwiki_run` payload. Given a run's
 * facts and its environment context, returns the fully-assembled event exactly
 * as it is sent to PostHog. Pure: it performs no IO and reads no process state,
 * so the production sender and the seed script cannot drift apart. The setup
 * fields (mode, provider, connectors) are present only when the caller supplies
 * them, so they are omitted from update payloads.
 */
export declare function buildRunEvent(details: RunTelemetry, context: RunEventContext): TelemetryEvent;
/**
 * Records a completed init/update run: the single event OpenWiki emits. Gates
 * on opt-out, resolves identity, builds the event via `buildRunEvent`, captures
 * it, and optionally tees the exact payload to `--telemetry-file`. The setup
 * fields (mode, provider, connectors) are only present on init, so they are
 * omitted when the caller leaves them undefined. Explicitly never throws.
 * (Chat is not recorded.)
 */
export declare function recordRun(details: RunTelemetry): Promise<void>;
