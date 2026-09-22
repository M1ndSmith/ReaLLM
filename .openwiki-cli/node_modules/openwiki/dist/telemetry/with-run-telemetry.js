import { describeErrorForTelemetry } from "./errors.js";
import { recordRunSafe } from "./record-run-safe.js";
/**
 * The single telemetry boundary for one run: the sole place an `openwiki_run` event
 * is recorded.
 *
 * It wraps the whole setup -> connectors -> agent sequence a caller performs, so a
 * failure anywhere in that sequence (repo setup, connector pull, agent prologue, or
 * the agent itself) is recorded exactly once, closing the pre-agent coverage holes
 * where a throw previously reached no telemetry. On a clean return it records the
 * outcome the agent published on `ctx` (defaulting to "success"); on a throw it
 * records "failure" with the anonymous diagnostics from
 * {@link describeErrorForTelemetry}, then rethrows so the CLI still owns the failure
 * UX. It never throws from telemetry: `recordRunSafe` swallows its own errors.
 *
 * @param command - Which run lifecycle this is. Only init/update are recorded; chat
 *   is dropped downstream by `recordRunSafe`.
 * @param options - The run options; `recordRunSafe` reads `outputMode` and
 *   `telemetryFile` from them.
 * @param ctx - The mutable context the wrapped `run` enriches (provider, outcome).
 * @param run - The run to perform and record: setup, connectors, and the agent.
 */
export async function withRunTelemetry(command, options, ctx, run) {
    try {
        const result = await run();
        await recordRunSafe(command, options, {
            provider: ctx.provider,
            outcome: ctx.outcome ?? "success",
        });
        return result;
    }
    catch (error) {
        await recordRunSafe(command, options, {
            provider: ctx.provider,
            outcome: "failure",
            // Class, detail, owner, stage, and status in one spread. Everything rides
            // closed-set enums or bare integers; no error text enters the payload.
            ...describeErrorForTelemetry(error),
        });
        throw error;
    }
}
