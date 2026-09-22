import type { ConnectorId } from "../connectors/types.js";
export declare const openWikiOnboardingPath: string;
export declare const openWikiInstructionsPath: string;
export declare const REPOSITORY_INSTRUCTIONS_FILE = "INSTRUCTIONS.md";
export type OnboardingSourceScheduleConfig = {
    description: string;
    expression: string;
    launchAgentPath?: string;
    pausedAt?: string;
    updatedAt: string;
    warning?: string;
};
export type OnboardingSourceConfig = {
    connectedAt?: string;
    connectorConfig?: Record<string, unknown>;
    ingestionGoal?: string;
    schedule?: OnboardingSourceScheduleConfig;
};
export type OnboardingSourceInstanceConfig = OnboardingSourceConfig & {
    connectorId: ConnectorId;
    id: string;
    name?: string;
};
export type OpenWikiPowerManagementConfig = {
    pmset?: {
        days: string;
        enabled: boolean;
        sleepTime: string;
        updatedAt: string;
        wakeTime: string;
        warning?: string;
    };
};
export type OpenWikiOnboardingConfig = {
    completedAt?: string;
    ingestionSchedule?: OnboardingSourceScheduleConfig;
    modeId?: string;
    modeName?: string;
    powerManagement?: OpenWikiPowerManagementConfig;
    sourceInstances: OnboardingSourceInstanceConfig[];
    sources: Partial<Record<ConnectorId, OnboardingSourceConfig>>;
    templateId?: string;
    templateName?: string;
    version: 1;
    wikiGoal?: string;
};
export declare function createEmptyOnboardingConfig(): OpenWikiOnboardingConfig;
export declare function readOpenWikiOnboardingConfig(): Promise<OpenWikiOnboardingConfig>;
export declare function saveOpenWikiOnboardingConfig(config: OpenWikiOnboardingConfig): Promise<void>;
export declare function getRepositoryWikiInstructionsPath(repoRoot: string): string;
export declare function readRepositoryWikiInstructions(repoRoot: string): Promise<string | undefined>;
export declare function saveRepositoryWikiInstructions(repoRoot: string, wikiGoal: string): Promise<void>;
export declare function isOnboardingComplete(config: OpenWikiOnboardingConfig): boolean;
export declare function isOpenWikiOnboardingCompleteSync(): boolean;
export declare function isRepositoryCodeOnboardingCompleteSync(repoRoot: string): boolean;
