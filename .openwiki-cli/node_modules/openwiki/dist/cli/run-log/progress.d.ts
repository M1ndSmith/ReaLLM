import type { OpenWikiCommand, RepositoryGenerationProgressEvent } from "../../agent/types.js";
import type { RunLogItem, RunRepositoryProgressLogItem } from "./types.js";
/**
 * Finds the single current repository lifecycle item in a bounded run log.
 *
 * @param log - Current bounded run log.
 * @returns Current repository progress, when this is a native repository run.
 */
export declare function findRepositoryProgress(log: readonly RunLogItem[]): RunRepositoryProgressLogItem | undefined;
/**
 * Formats structured repository progress for the interactive run stage.
 *
 * @param progress - Current lifecycle event or retained log item.
 * @param command - Repository command represented by the run.
 * @returns Concise human-readable lifecycle label.
 */
export declare function formatRepositoryProgress(progress: RepositoryGenerationProgressEvent | RunRepositoryProgressLogItem, command: OpenWikiCommand): string;
/**
 * Formats one structured event as a print-mode progress line.
 *
 * @param event - Repository lifecycle event emitted by the native runner.
 * @param command - Repository command represented by the run.
 * @returns One newline-terminated progress line.
 */
export declare function formatRepositoryPrintProgress(event: RepositoryGenerationProgressEvent, command: OpenWikiCommand): string;
