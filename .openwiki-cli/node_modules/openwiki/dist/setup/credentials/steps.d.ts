import type * as React from "react";
import { type OpenWikiProvider } from "../../config/constants.js";
import { type OpenWikiOnboardingConfig } from "../onboarding.js";
import type { PromptStep, SetupStepState, SourceSetupOption, ModelSelectionOption, SourceSecretInput, PromptInputKey, ReasoningEffortSelection } from "./types.js";
import { FINAL_OPTIONS } from "./constants.js";
import type { OpenWikiRunMode } from "../../cli/commands.js";
import type { LangSmithRegion } from "../../connectors/sources/langsmith/setup.js";
import type { ConnectorId } from "../../connectors/types.js";
export declare function needsCredentialSetup(modelIdOverride?: string | null, mode?: OpenWikiRunMode): boolean;
export declare function needsAwsCredentialRepair(provider: OpenWikiProvider): boolean;
/**
 * Whether the provider still needs its primary credential collected. For
 * `oauth` providers this is a valid, non-expired stored token; for API-key
 * providers it is a pasted key; for keyless providers (gemini-enterprise) it is
 * the required GCP project id.
 */
export declare function needsCredentialStep(provider: OpenWikiProvider): boolean;
/** The step that collects the provider's primary credential. */
export declare function credentialStep(provider: OpenWikiProvider): PromptStep | null;
/**
 * Every managed env key the wizard lets you set for a provider, in checklist
 * order: the provider selection, its credential keys, the model, and the
 * LangSmith tracing key. Used to detect which of them a shell export is
 * currently shadowing (a shell var wins at runtime and would silently override
 * the choice made here). Returns key names only, never values.
 */
export declare function getWizardManagedEnvKeys(provider: OpenWikiProvider): string[];
export type ReasoningEffortSelectionOption = {
    label: string;
    value: ReasoningEffortSelection;
};
export declare function getReasoningEffortSelectionOptions(provider: OpenWikiProvider, modelId: string): ReasoningEffortSelectionOption[];
export declare function getReasoningEffortSelectionIndex(provider: OpenWikiProvider, modelId: string, value: string | undefined): number;
/**
 * The setup steps that apply to a provider and run mode, in the order the wizard
 * walks them. Unlike the skip-based waterfall in {@link getInitialStep}, this
 * includes steps already satisfied by the environment, so navigation can reach
 * and re-edit an auto-skipped step. The provider's primary credential step
 * ({@link credentialStep}) is emitted once; for keyless providers that step is
 * the GCP project, so it is not appended again below.
 */
export declare function orderedSetupSteps(provider: OpenWikiProvider, mode: OpenWikiRunMode, allowModeSelection: boolean): PromptStep[];
/**
 * The step after `step` in the applicable spine, or null when `step` is the last
 * spine step or outside it. Drives forward navigation: Enter advances to the
 * next applicable step in order rather than skipping ones already satisfied by
 * the environment, so setup reads as a sequential walk.
 */
export declare function nextSetupStep(step: PromptStep | null, provider: OpenWikiProvider, mode: OpenWikiRunMode, allowModeSelection: boolean): PromptStep | null;
export declare function hasValidStoredToken(env?: NodeJS.ProcessEnv): boolean;
export declare function needsGcpProjectStep(provider: OpenWikiProvider): boolean;
export declare function needsBaseUrlStep(provider: OpenWikiProvider): boolean;
export declare function isBaseUrlConfigured(provider: OpenWikiProvider): boolean;
export declare function needsSecretKeyStep(provider: OpenWikiProvider): boolean;
export declare function isSecretKeyConfigured(provider: OpenWikiProvider): boolean;
export declare function needsRegionStep(provider: OpenWikiProvider): boolean;
/**
 * Whether the optional LangSmith tracing step still needs to be shown.
 *
 * The step is optional, so "answered" must include skipping it. Skipping does
 * not persist `LANGSMITH_API_KEY` — `saveOpenWikiEnv` strips empty values, so
 * the key is simply absent afterwards. What the step always records instead is
 * `LANGCHAIN_TRACING_V2` (`"false"` on skip, `"true"` when a key is entered),
 * which survives because it is non-empty. So the step is unanswered only when
 * neither a key is present (e.g. from a shell export) nor a tracing decision
 * has been recorded.
 */
export declare function needsLangSmithStep(env?: NodeJS.ProcessEnv): boolean;
export declare function isRegionConfigured(provider: OpenWikiProvider): boolean;
export declare function isCredentialConfigured(provider: OpenWikiProvider): boolean;
/**
 * Resolve a checklist row's status. The active step wins, so navigating back to
 * an already-done step shows the current-row cursor rather than a check; a done
 * step reads done; anything else falls to its resting status.
 */
export declare function resolveStepStatus(id: PromptStep, activeStep: PromptStep | null, done: boolean, resting?: "optional" | "pending"): SetupStepState;
export declare function getInitialStep(modelIdOverride: string | null, provider: OpenWikiProvider, onboardingConfig?: OpenWikiOnboardingConfig, mode?: OpenWikiRunMode, allowModeSelection?: boolean, walkAll?: boolean): PromptStep | null;
export declare function getNextStepAfterProvider(provider: OpenWikiProvider, modelIdOverride: string | null, onboardingConfig?: OpenWikiOnboardingConfig, mode?: OpenWikiRunMode, forceModelStep?: boolean): PromptStep | null;
export declare function getNextStepAfterApiKey(provider: OpenWikiProvider, modelIdOverride: string | null, onboardingConfig: OpenWikiOnboardingConfig, mode: OpenWikiRunMode, forceModelStep?: boolean): PromptStep | null;
export declare function getNextStepAfterSecretKey(provider: OpenWikiProvider, modelIdOverride: string | null, onboardingConfig: OpenWikiOnboardingConfig, mode: OpenWikiRunMode, forceModelStep?: boolean): PromptStep | null;
export declare function getNextStepAfterGcpLocation(provider: OpenWikiProvider, modelIdOverride: string | null, onboardingConfig?: OpenWikiOnboardingConfig, mode?: OpenWikiRunMode, forceModelStep?: boolean): PromptStep | null;
export declare function getNextStepAfterBaseUrl(provider: OpenWikiProvider, modelIdOverride: string | null, onboardingConfig: OpenWikiOnboardingConfig, mode: OpenWikiRunMode, forceModelStep?: boolean): PromptStep | null;
export declare function getNextStepAfterRegion(provider: OpenWikiProvider, modelIdOverride: string | null, onboardingConfig: OpenWikiOnboardingConfig, mode: OpenWikiRunMode, forceModelStep?: boolean): PromptStep | null;
export declare function ensureRunModeConfig(config: OpenWikiOnboardingConfig, mode: OpenWikiRunMode): OpenWikiOnboardingConfig;
export declare function hydrateRunModeConfig(config: OpenWikiOnboardingConfig, mode: OpenWikiRunMode, repoRoot: string): Promise<OpenWikiOnboardingConfig>;
export declare function getRunModeSelectionIndex(mode: OpenWikiRunMode): number;
export declare function getLangsmithRegionSelectionIndex(region: LangSmithRegion): number;
export declare function getLangsmithRegionLabel(region: LangSmithRegion): string;
export declare function getRunModeName(mode: OpenWikiRunMode): string;
export declare function getSourceOption(sourceId: ConnectorId): SourceSetupOption;
export declare function getConfigModeId(config: OpenWikiOnboardingConfig): string | undefined;
export declare function getConfigModeName(config: OpenWikiOnboardingConfig): string | undefined;
export declare function isCodeMode(config: OpenWikiOnboardingConfig): boolean;
export declare function hasValidConfiguredProvider(): boolean;
export declare function getDefaultCodeRepoRootPath(): string;
export declare function findNearestGitRepoRoot(startPath: string): string | null;
export declare function needsEnvValue(secretInput: SourceSecretInput): boolean;
export declare function addSourceInstanceConfig(config: OpenWikiOnboardingConfig, sourceInstance: OpenWikiOnboardingConfig["sourceInstances"][number]): OpenWikiOnboardingConfig;
export declare function deriveLegacySources(sourceInstances: OpenWikiOnboardingConfig["sourceInstances"]): OpenWikiOnboardingConfig["sources"];
export declare function getSourceInstanceCount(config: OpenWikiOnboardingConfig, sourceId: ConnectorId): number;
export declare function getSourceInstances(config: OpenWikiOnboardingConfig, sourceId: ConnectorId): OpenWikiOnboardingConfig["sourceInstances"];
export declare function getConnectedSourceCount(config: OpenWikiOnboardingConfig, sourceOptions: readonly SourceSetupOption[]): number;
export declare function createSourceInstanceId(sourceId: ConnectorId, config: OpenWikiOnboardingConfig): string;
export declare function createSourceInstanceName(source: SourceSetupOption, description: string, config: OpenWikiOnboardingConfig): string;
export declare function isSourceStep(step: PromptStep | null): boolean;
export declare function isScheduleStep(step: PromptStep | null): boolean;
/**
 * Label for the provider's primary credential input. Bedrock authenticates
 * with an IAM access key ID (paired with a secret access key), not a single
 * opaque API key, so its prompt reads differently from every other provider.
 */
export declare function getApiKeyFieldLabel(provider: OpenWikiProvider): string;
export declare function getModelSetupDetail(modelIdOverride: string | null, provider: OpenWikiProvider): string;
export declare function getModelSelectionOptions(provider: OpenWikiProvider): ModelSelectionOption[];
export declare function shouldStartWithCustomModelInput(provider: OpenWikiProvider): boolean;
export declare function getSelectedModelId(provider: OpenWikiProvider, selectedIndex: number, input: string, isCustomInput: boolean): string | null;
export declare function getProviderSelectionIndex(provider: OpenWikiProvider): number;
export declare function getModelSelectionIndex(provider: OpenWikiProvider, selectedModelId: string): number;
export declare function moveSelectionIndex(currentIndex: number, offset: number, itemCount: number): number;
export declare function getInputDisplayWidth(stdoutColumns: number | undefined): number;
export declare function getProviderArticle(provider: OpenWikiProvider): "a" | "an";
export declare function getTemplateGoal(templateId: string | undefined): string;
export declare function getSourceMenuLabel(source: SourceSetupOption, sourceInstanceCount: number): string;
export declare function getTemplateSourceOptions(templateId: string | undefined): readonly SourceSetupOption[];
export declare function getSourceDescriptionPrompt(source: SourceSetupOption): string;
export declare function getFinalOptionLabel(option: (typeof FINAL_OPTIONS)[number], mode: OpenWikiRunMode): string;
export declare function getSourceDescriptionOptionCount(source: SourceSetupOption): number;
export declare function handleCronEditorInput({ currentFieldIndex, currentValue, fallbackExpression, inputValue, key, replaceCurrentField, setCurrentFieldIndex, setReplaceCurrentField, setValue, }: {
    currentFieldIndex: number;
    currentValue: string;
    fallbackExpression: string;
    inputValue: string;
    key: PromptInputKey;
    replaceCurrentField: boolean;
    setCurrentFieldIndex: React.Dispatch<React.SetStateAction<number>>;
    setReplaceCurrentField: React.Dispatch<React.SetStateAction<boolean>>;
    setValue: React.Dispatch<React.SetStateAction<string>>;
}): boolean;
export declare function getCronFields(expression: string, fallbackExpression: string): string[];
export declare function parseCronFieldPaste(inputValue: string): string[];
export declare function sanitizeInputChunk(value: string): string;
export declare function sanitizeCronInputChunk(value: string): string;
export declare function sanitizeRepoId(value: string): string;
export declare function getDefaultLocalGitRepoPath(): string;
export declare function validateLocalDirectoryPath(value: string): Promise<string>;
export declare function normalizeLocalPath(value: string): string;
export declare function getStaticSourceConfig(sourceId: ConnectorId, query: string): Record<string, unknown>;
export declare function getErrorMessage(error: unknown): string;
