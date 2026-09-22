import type { ConnectorId } from "../connectors/types.js";
import type { OpenWikiOnboardingConfig } from "../setup/onboarding.js";
export type CronValidationResult = {
    description: string;
    expression: string;
    valid: true;
} | {
    error: string;
    expression: string;
    valid: false;
};
export type ScheduleInstallResult = {
    description: string;
    expression: string;
    launchAgentPath?: string;
    warning?: string;
};
export type ConnectorScheduleStatus = {
    connectorId?: ConnectorId;
    description: string;
    displayName?: string;
    expression: string;
    launchAgentLoaded: boolean;
    launchAgentPath?: string;
    launchAgentPlistExists: boolean;
    pausedAt?: string;
    sourceInstanceId: string;
    updatedAt: string;
    warning?: string;
};
export type PowerScheduleInstallResult = {
    days: string;
    enabled: boolean;
    sleepTime: string;
    wakeTime: string;
    warning?: string;
};
export type PowerScheduleStatus = PowerScheduleInstallResult & {
    updatedAt: string;
};
export type ScheduleMutationResult = {
    config: OpenWikiOnboardingConfig;
    connectorIds: string[];
    powerSchedule?: PowerScheduleInstallResult;
    skippedConnectorIds: string[];
    warnings: string[];
};
export type ScheduleTarget = ConnectorId | "all";
type CalendarInterval = Partial<Record<"Hour" | "Minute" | "Month" | "Day" | "Weekday", number>>;
export declare function validateCronExpression(expression: string): CronValidationResult;
export declare function describeCronExpression(expression: string): string;
export declare function getSuggestedCronExpression(config: OpenWikiOnboardingConfig): string;
export declare function installConnectorSchedule({ connectorId, cronExpression, cwd, }: {
    connectorId: ConnectorId;
    cronExpression: string;
    cwd: string;
}): Promise<ScheduleInstallResult>;
export declare function listConnectorSchedules(config: OpenWikiOnboardingConfig): Promise<ConnectorScheduleStatus[]>;
export declare function pauseConnectorSchedules(config: OpenWikiOnboardingConfig, target: ScheduleTarget): Promise<ScheduleMutationResult>;
export declare function resumeConnectorSchedules({ config, cwd, target, }: {
    config: OpenWikiOnboardingConfig;
    cwd: string;
    target: ScheduleTarget;
}): Promise<ScheduleMutationResult>;
export declare function deleteConnectorSchedules(config: OpenWikiOnboardingConfig, target: ScheduleTarget): Promise<ScheduleMutationResult>;
export declare function installOpenWikiPowerSchedule(config: OpenWikiOnboardingConfig): Promise<PowerScheduleInstallResult>;
export declare function getSavedPowerScheduleStatus(config: OpenWikiOnboardingConfig): PowerScheduleStatus | null;
/**
 * Translates a simple cron expression into a launchd `StartCalendarInterval`,
 * or `null` when the expression cannot be represented faithfully (callers then
 * fall back to a "too complex for launchd" warning). Exported for testing.
 */
export declare function parseLaunchdCalendarInterval(expression: string): CalendarInterval | null;
export {};
