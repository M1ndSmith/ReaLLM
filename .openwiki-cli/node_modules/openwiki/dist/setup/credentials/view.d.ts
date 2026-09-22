import { type OpenWikiProvider } from "../../config/constants.js";
import type { CodexTokens } from "../../agent/openai-chatgpt-oauth.js";
import type { OpenWikiRunMode } from "../../cli/commands.js";
import type { ExternalCliAuthState } from "../../auth/external-cli-auth.js";
import type { OpenWikiOnboardingConfig } from "../onboarding.js";
import type { LangsmithWorkspaceDraft, PromptStep, SourceSetupOption, SourceSetupState } from "./types.js";
/**
 * Props for {@link InitSetupView}: the full snapshot of wizard state, props,
 * and derived values the setup summary reads. Every field is read-only render
 * input; the view calls no setters or handlers.
 */
export interface InitSetupViewProps {
    /**
     * Whether the run-mode row is a selectable wizard step rather than a fixed,
     * already-decided value.
     */
    allowModeSelection: boolean;
    /** The step currently in focus, or null while the wizard is still seeding. */
    step: PromptStep | null;
    /** The run mode being configured (code vs personal). */
    selectedMode: OpenWikiRunMode;
    /** The provider selected for this run. */
    provider: OpenWikiProvider;
    /** True once the user confirms a provider this session. */
    providerConfirmed: boolean;
    /** API key entered this session, or null when none was typed. */
    apiKey: string | null;
    /** OAuth tokens obtained this session, or null when none were obtained. */
    oauthTokens: CodexTokens | null;
    /** Secret key entered this session, or null when none was typed. */
    secretKey: string | null;
    /** GCP project entered this session, or null when none was typed. */
    gcpProject: string | null;
    /** GCP location entered this session, or null when none was typed. */
    gcpLocation: string | null;
    /** Base URL entered this session, or null when none was typed. */
    baseUrl: string | null;
    /** Region entered this session, or null when none was typed. */
    region: string | null;
    /** Model ID chosen this session, or null when none was chosen. */
    modelId: string | null;
    /** Model ID forced by the caller (`--model`), or null when not overridden. */
    modelIdOverride: string | null;
    /** Reasoning effort selected this session, or null when not collected. */
    reasoningEffort?: string | null;
    /** LangSmith key entered this session, or null when none was typed. */
    langSmithKey: string | null;
    /** The onboarding config as the wizard has edited it so far. */
    onboardingConfig: OpenWikiOnboardingConfig;
    /** True once the OAuth login URL was copied to the clipboard. */
    copied: boolean;
    /** The shared single-line input buffer for the active prompt. */
    input: string;
    /** True while the OAuth browser sign-in is in progress. */
    isLoggingIn: boolean;
    /** The OAuth login URL to display, or null before one is issued. */
    loginUrl: string | null;
    /** Dedicated buffer for the code-repo-path field. */
    codeRepoPathInput: string;
    /** The resolved code-repo root path shown on the confirm step. */
    codeRepoRoot: string;
    /** State of the external CLI credential probe/login. */
    externalCliAuth: ExternalCliAuthState;
    /** Selection cursor for the code-repo confirm menu. */
    codeRepoSelectionIndex: number;
    /** Active field cursor for the segmented cron input. */
    cronFieldSelectionIndex: number;
    /** Selection cursor for the cron mode menu. */
    cronModeSelectionIndex: number;
    /** Selection cursor for the final menu. */
    finalSelectionIndex: number;
    /** True while the user is entering a custom model ID. */
    isCustomModelInput: boolean;
    /** The LangSmith workspace currently being added or edited, or null. */
    langsmithDraft: LangsmithWorkspaceDraft | null;
    /** Selection cursor for the LangSmith region menu. */
    langsmithRegionSelectionIndex: number;
    /** Selection cursor for the LangSmith workspaces menu. */
    langsmithWorkspaceSelectionIndex: number;
    /** LangSmith workspaces as the wizard has edited them. */
    langsmithWorkspaces: LangsmithWorkspaceDraft[];
    /** Selection cursor for the model menu. */
    modelSelectionIndex: number;
    /** Selection cursor for the reasoning effort menu. */
    reasoningEffortSelectionIndex?: number;
    /** Selection cursor for the power-mode menu. */
    powerModeSelectionIndex: number;
    /** Selection cursor for the provider menu. */
    providerSelectionIndex: number;
    /** Selection cursor for the run-mode menu. */
    runModeSelectionIndex: number;
    /** Cursor for the current source secret input field. */
    secretInputIndex: number;
    /** Selection cursor for the source-confirm-continue menu. */
    sourceContinueSelectionIndex: number;
    /** Selection cursor for the source description menu. */
    sourceDescriptionSelectionIndex: number;
    /** Selection cursor for the source menu. */
    sourceSelectionIndex: number;
    /** State of the in-progress source setup (secret values, auth, warnings). */
    sourceState: SourceSetupState;
    /** Selection cursor for the onboarding template menu. */
    templateSelectionIndex: number;
    /** Transient status notice to surface, or null when none. */
    notice: string | null;
    /** Transient error to surface, or null when none. */
    error: string | null;
    /** True while the wizard is writing the setup to disk. */
    isSaving: boolean;
    /** True while waiting for the browser authorization callback. */
    isAuthRunning: boolean;
    /** The active source options for the current mode/template. */
    activeSourceOptions: readonly SourceSetupOption[];
    /** The source option currently selected in the source sub-flow. */
    selectedSource: SourceSetupOption;
    /** The suggested cron expression for the current onboarding config. */
    suggestedCronExpression: string;
    /** The human-readable description of the suggested cron expression. */
    suggestedCronDescription: string;
    /** The computed display width for single-line inputs. */
    inputDisplayWidth: number;
    /**
     * The length of the back-navigation history stack; controls the "esc to go
     * back" hint. Passed as a plain number so the view stays ref-free.
     */
    navHistoryLength: number;
}
/**
 * Presentational, side-effect-free view of the setup wizard. Renders the
 * detected-command summary, the set-up step list, the active prompt panel, and
 * the status/error/saving panels from the props snapshot. It calls no setters
 * and no handlers.
 */
export declare function InitSetupView({ allowModeSelection, step, selectedMode, provider, providerConfirmed, apiKey, oauthTokens, secretKey, gcpProject, gcpLocation, baseUrl, region, modelId, modelIdOverride, reasoningEffort, langSmithKey, onboardingConfig, copied, input, isLoggingIn, loginUrl, codeRepoPathInput, codeRepoRoot, externalCliAuth, codeRepoSelectionIndex, cronFieldSelectionIndex, cronModeSelectionIndex, finalSelectionIndex, isCustomModelInput, langsmithDraft, langsmithRegionSelectionIndex, langsmithWorkspaceSelectionIndex, langsmithWorkspaces, modelSelectionIndex, reasoningEffortSelectionIndex, powerModeSelectionIndex, providerSelectionIndex, runModeSelectionIndex, secretInputIndex, sourceContinueSelectionIndex, sourceDescriptionSelectionIndex, sourceSelectionIndex, sourceState, templateSelectionIndex, notice, error, isSaving, isAuthRunning, activeSourceOptions, selectedSource, suggestedCronExpression, suggestedCronDescription, inputDisplayWidth, navHistoryLength, }: InitSetupViewProps): import("react").JSX.Element;
