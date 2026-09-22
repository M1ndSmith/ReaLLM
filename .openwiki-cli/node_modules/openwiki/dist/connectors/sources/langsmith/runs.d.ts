import type { Run } from "langsmith";
import type { SampleStats, Trace, TraceBucket } from "./types.js";
/**
 * One selected root run and the bucket that put it in the sample.
 */
export interface BucketedRoot {
    bucket: TraceBucket;
    run: Run;
}
/**
 * Caps for anomaly-weighted selection. `total` is the overall trace budget.
 */
export interface SampleCaps {
    errorCap: number;
    outlierCap: number;
    total: number;
}
/**
 * Selects the sample from two lean root-run pools within the window, biased
 * toward anomalies: errors first (up to errorCap), then latency outliers among
 * the non-errored runs (up to outlierCap, at most a quarter of the non-errored
 * pool so the bucket stays a genuine tail rather than swallowing a small pull,
 * and the remaining budget), then the most-recent non-errored runs to backfill
 * to `total`. With no errors/outliers it degrades to all-baseline — the same
 * recency behavior as before. Runs are deduped by id; `nonErrorRuns` is assumed
 * most-recent-first.
 */
export declare function selectSampleBuckets(errorRuns: Run[], nonErrorRuns: Run[], caps: SampleCaps): BucketedRoot[];
/**
 * Converts a trace's raw runs into an ordered, compacted tree tagged with its
 * sampling bucket, or undefined when the trace is empty. Runs are ordered
 * root-first then by start time so the tool sequence is legible. Inputs/outputs
 * are never fetched (they are enormous for coding-agent traces and never reach
 * the committed page), so a compacted run is structure, timings, tokens, and the
 * truncated error text.
 */
export declare function compactTrace(runs: Run[], projectUrl: string, bucket: TraceBucket, maxFieldChars: number): Trace | undefined;
/**
 * Light summary over the selected roots. Because the sample is anomaly-weighted,
 * bucket counts are reported as composition and medians are computed over the
 * BASELINE bucket only, so they read as normal-operation references rather than
 * fleet rates skewed by the over-sampled tail.
 */
export declare function summarizeSample(selected: BucketedRoot[]): SampleStats;
/**
 * A run counts as failed when it errored or ended in the error status. An
 * "interrupted" run is NOT a failure: that status marks a human-in-the-loop
 * pause (a GraphInterrupt awaiting approval), which is normal control flow, and
 * its error field carries the paused action's args, not a failure signature —
 * so counting it would both mislabel the sample and drag user data into the
 * committed error text.
 */
export declare function isErrorRun(run: Run): boolean;
