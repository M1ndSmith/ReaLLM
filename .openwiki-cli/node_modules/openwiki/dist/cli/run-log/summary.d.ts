import type { OpenWikiCommand } from "../../agent/types.js";
import type { RunLogItem, RunToolLogItem } from "./types.js";
/**
 * Categorized counters accumulated for one active run.
 */
interface RunCounts {
    /**
     * Total number of tool calls that started.
     */
    actionCount: number;
    /**
     * Number of tool calls that failed.
     *
     * @default undefined - no tool calls failed.
     */
    errorCount?: number;
    /**
     * Number of explicit file-read calls.
     */
    readCount: number;
    /**
     * Number of repository-search calls.
     */
    searchCount: number;
    /**
     * Number of delegated agent tasks.
     */
    taskCount: number;
    /**
     * Number of explicit file-write calls.
     */
    writeCount: number;
}
/**
 * Returns the single aggregate tool summary carried by a run log.
 */
export declare function findRunSummary(log: RunLogItem[]): RunToolLogItem | undefined;
/**
 * Formats the categorized progress counts shown while a run is active.
 */
export declare function formatRunCounts({ actionCount, errorCount, readCount, searchCount, taskCount, writeCount, }: RunCounts): string;
/**
 * Formats the useful secondary counts for a completed run. Write-call counts
 * are omitted because the outcome title reports unique successfully written
 * pages instead.
 */
export declare function formatCompletedRunCounts(summary?: RunToolLogItem): string | undefined;
/**
 * Builds the outcome-first title for a settled run.
 */
export declare function formatRunCompletionTitle(command: OpenWikiCommand, log: RunLogItem[], durationMs?: number): string;
export {};
