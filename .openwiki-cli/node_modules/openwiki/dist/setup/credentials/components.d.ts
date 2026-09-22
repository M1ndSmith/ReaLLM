import type React from "react";
import { type OpenWikiProvider } from "../../config/constants.js";
import type { AuthProviderId } from "../../auth/types.js";
import type { OpenWikiRunMode } from "../../cli/commands.js";
import { type ExternalCliAuthState } from "../../auth/external-cli-auth.js";
import type { OpenWikiOnboardingConfig } from "../onboarding.js";
import { type ReasoningEffortSelectionOption } from "./steps.js";
import type { LangsmithWorkspaceDraft, PromptStep, SetupStepState, SourceSetupOption, SourceSetupState } from "./types.js";
export declare function Prompt({ codeRepoPathInput, codeRepoRoot, codeRepoSelectionIndex, externalCliAuth, cronFieldSelectionIndex, cronModeSelectionIndex, finalSelectionIndex, input, inputDisplayWidth, isCustomModelInput, langsmithDraft, langsmithRegionSelectionIndex, langsmithWorkspaceSelectionIndex, langsmithWorkspaces, modelSelectionIndex, reasoningEffortOptions, reasoningEffortSelectionIndex, onboardingConfig, powerModeSelectionIndex, provider, providerSelectionIndex, runModeSelectionIndex, secretInputIndex, selectedMode, selectedSource, sourceOptions, sourceContinueSelectionIndex, sourceDescriptionSelectionIndex, sourceSelectionIndex, sourceState, step, suggestedCronDescription, suggestedCronExpression, templateSelectionIndex, }: {
    codeRepoPathInput: string;
    codeRepoRoot: string;
    codeRepoSelectionIndex: number;
    externalCliAuth: ExternalCliAuthState;
    cronFieldSelectionIndex: number;
    cronModeSelectionIndex: number;
    finalSelectionIndex: number;
    input: string;
    inputDisplayWidth: number;
    isCustomModelInput: boolean;
    langsmithDraft: LangsmithWorkspaceDraft | null;
    langsmithRegionSelectionIndex: number;
    langsmithWorkspaceSelectionIndex: number;
    langsmithWorkspaces: LangsmithWorkspaceDraft[];
    modelSelectionIndex: number;
    reasoningEffortOptions?: readonly ReasoningEffortSelectionOption[];
    reasoningEffortSelectionIndex?: number;
    onboardingConfig: OpenWikiOnboardingConfig;
    powerModeSelectionIndex: number;
    provider: OpenWikiProvider;
    providerSelectionIndex: number;
    runModeSelectionIndex: number;
    secretInputIndex: number;
    selectedMode: OpenWikiRunMode;
    selectedSource: SourceSetupOption;
    sourceOptions: readonly SourceSetupOption[];
    sourceContinueSelectionIndex: number;
    sourceDescriptionSelectionIndex: number;
    sourceSelectionIndex: number;
    sourceState: SourceSetupState;
    step: PromptStep;
    suggestedCronDescription: string;
    suggestedCronExpression: string;
    templateSelectionIndex: number;
}): React.JSX.Element | null;
export declare function ExternalCliAuthPrompt({ authState, input, provider, }: {
    authState: ExternalCliAuthState;
    input: string;
    provider: OpenWikiProvider;
}): React.JSX.Element | null;
export declare function SetupHeader(): React.JSX.Element;
export declare function SetupStep({ detail, label, state, }: {
    detail: string;
    label: string;
    state: SetupStepState;
}): React.JSX.Element;
export declare function SetupPanel({ children, title, }: {
    children: React.ReactNode;
    title: string;
}): React.JSX.Element;
export declare function SelectionMarker({ isSelected }: {
    isSelected: boolean;
}): React.JSX.Element;
export declare function SourceConnectionStatus({ count, isConfigured, }: {
    count: number;
    isConfigured: boolean;
}): React.JSX.Element;
export declare function OAuthAuthorizationLink({ authProvider, copiedToClipboard, url, }: {
    authProvider?: AuthProviderId;
    copiedToClipboard: boolean;
    url: string;
}): React.JSX.Element;
export declare function OAuthLoginPrompt({ copied, input, isLoggingIn, loginUrl, provider, }: {
    copied: boolean;
    input: string;
    isLoggingIn: boolean;
    loginUrl: string | null;
    provider: OpenWikiProvider;
}): React.JSX.Element;
export declare function BorderedInput({ borderColor, maxDisplayWidth, marginTop, prefix, secret, showCursor, value, }: {
    borderColor?: "cyan" | "gray";
    maxDisplayWidth: number;
    marginTop?: number;
    prefix?: string;
    secret?: boolean;
    showCursor?: boolean;
    value: string;
}): React.JSX.Element;
export declare function BorderedMultilineInput({ borderColor, maxDisplayWidth, marginTop, showCursor, value, }: {
    borderColor?: "cyan" | "gray";
    maxDisplayWidth: number;
    marginTop?: number;
    showCursor?: boolean;
    value: string;
}): React.JSX.Element;
export declare function InputValueWithCursor({ maxDisplayWidth, secret, showCursor, value, }: {
    maxDisplayWidth: number;
    secret?: boolean;
    showCursor?: boolean;
    value: string;
}): React.JSX.Element;
export declare function SegmentedCronInput({ activeFieldIndex, expression, fallbackExpression, maxDisplayWidth, }: {
    activeFieldIndex: number;
    expression: string;
    fallbackExpression: string;
    maxDisplayWidth: number;
}): React.JSX.Element;
