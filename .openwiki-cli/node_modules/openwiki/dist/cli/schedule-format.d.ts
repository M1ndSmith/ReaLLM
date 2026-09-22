import type { ConnectorScheduleStatus, PowerScheduleStatus, ScheduleMutationResult } from "../scheduling/schedules.js";
/**
 * Formats the outcome of a delete/pause/resume schedule mutation into a
 * bordered summary listing the changed and skipped connectors, any Mac wake
 * configuration, and warnings.
 */
export declare function formatScheduleMutationResult(action: "delete" | "pause" | "resume", result: ScheduleMutationResult): string;
/**
 * Formats the banner shown above a schedule listing, pluralizing the count.
 */
export declare function formatScheduleHeader(scheduleCount: number): string;
/**
 * Formats the Mac wake-window section of a schedule listing, rendering a
 * not-configured placeholder when no power schedule exists.
 */
export declare function formatPowerScheduleStatus(schedule: PowerScheduleStatus | null): string;
/**
 * Formats a single connector schedule into a bordered block describing its
 * cron expression, launchd installation state, and any warning.
 */
export declare function formatScheduleStatus(schedule: ConnectorScheduleStatus): string;
