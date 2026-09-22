import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { DEFAULT_VERTEX_LOCATION, getDefaultModelId, getMissingProviderEnvKey, getProviderApiKeyEnvKey, getProviderLabel, getProviderLocationEnvKey, getProviderProjectEnvKey, OPENWIKI_MODEL_ID_ENV_KEY, OPENWIKI_REASONING_EFFORT_ENV_KEY, providerRequiresBaseUrl, providerRequiresRegion, providerRequiresSecretKey, providerUsesAwsSdkCredentials, providerUsesOAuth, } from "../../config/constants.js";
import { getShellEnvValue } from "../../config/env.js";
import { credentialStep, getConnectedSourceCount, getModelSetupDetail, getReasoningEffortSelectionOptions, getRunModeName, getWizardManagedEnvKeys, hasValidConfiguredProvider, isBaseUrlConfigured, isCredentialConfigured, isRegionConfigured, isScheduleStep, isSecretKeyConfigured, isSourceStep, needsAwsCredentialRepair, needsBaseUrlStep, needsCredentialStep, needsLangSmithStep, needsRegionStep, needsSecretKeyStep, resolveStepStatus, } from "./steps.js";
import { getCredentialSetupDetail } from "./format.js";
import { OAuthLoginPrompt, Prompt, SetupHeader, SetupPanel, SetupStep, } from "./components.js";
/**
 * Presentational, side-effect-free view of the setup wizard. Renders the
 * detected-command summary, the set-up step list, the active prompt panel, and
 * the status/error/saving panels from the props snapshot. It calls no setters
 * and no handlers.
 */
export function InitSetupView({ allowModeSelection, step, selectedMode, provider, providerConfirmed, apiKey, oauthTokens, secretKey, gcpProject, gcpLocation, baseUrl, region, modelId, modelIdOverride, reasoningEffort = null, langSmithKey, onboardingConfig, copied, input, isLoggingIn, loginUrl, codeRepoPathInput, codeRepoRoot, externalCliAuth, codeRepoSelectionIndex, cronFieldSelectionIndex, cronModeSelectionIndex, finalSelectionIndex, isCustomModelInput, langsmithDraft, langsmithRegionSelectionIndex, langsmithWorkspaceSelectionIndex, langsmithWorkspaces, modelSelectionIndex, reasoningEffortSelectionIndex = 0, powerModeSelectionIndex, providerSelectionIndex, runModeSelectionIndex, secretInputIndex, sourceContinueSelectionIndex, sourceDescriptionSelectionIndex, sourceSelectionIndex, sourceState, templateSelectionIndex, notice, error, isSaving, isAuthRunning, activeSourceOptions, selectedSource, suggestedCronExpression, suggestedCronDescription, inputDisplayWidth, navHistoryLength, }) {
    const needsCredentialPrompt = !hasValidConfiguredProvider() ||
        needsAwsCredentialRepair(provider) ||
        needsCredentialStep(provider) ||
        needsSecretKeyStep(provider) ||
        needsBaseUrlStep(provider) ||
        needsRegionStep(provider) ||
        (modelIdOverride === null &&
            process.env[OPENWIKI_MODEL_ID_ENV_KEY] === undefined) ||
        needsLangSmithStep();
    const apiKeyEnvKey = getProviderApiKeyEnvKey(provider);
    const primaryCredentialStep = credentialStep(provider);
    const projectEnvKey = getProviderProjectEnvKey(provider);
    const locationEnvKey = getProviderLocationEnvKey(provider);
    const selectedModelId = modelId ??
        modelIdOverride ??
        process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
        getDefaultModelId(provider);
    const reasoningEffortOptions = getReasoningEffortSelectionOptions(provider, selectedModelId);
    // A shell export wins over saved config at runtime. List any wizard-managed
    // keys present in the shell so their precedence is not a surprise and the
    // "from shell" rows below are explained. Presence only, not a value compare;
    // key names only, never values.
    const shadowedShellKeys = getWizardManagedEnvKeys(provider).filter((key) => getShellEnvValue(key) !== undefined);
    const isSingleShadow = shadowedShellKeys.length === 1;
    const shadowedShellWarning = shadowedShellKeys.length === 0
        ? null
        : `${isSingleShadow ? "This key was" : "These keys were"} detected in your shell and ${isSingleShadow ? "overrides" : "override"} saved config: ${shadowedShellKeys.join(", ")}. Runs use the shell ` +
            `value${isSingleShadow ? "" : "s"}; unset ${isSingleShadow ? "it" : "them"} to use your saved config.`;
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(SetupHeader, {}), shadowedShellWarning ? (_jsx(Box, { marginBottom: 1, marginLeft: 2, children: _jsxs(Text, { color: "yellow", children: ["\u26A0 ", shadowedShellWarning] }) })) : null, _jsxs(Box, { flexDirection: "column", marginBottom: 1, marginLeft: 2, children: [_jsx(Text, { color: "gray", children: "Detected from your command" }), _jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsx(SetupStep, { label: "Run mode", state: allowModeSelection
                                    ? step === "run-mode"
                                        ? "current"
                                        : "done"
                                    : "done", detail: getRunModeName(selectedMode) }), selectedMode === "code" ? (_jsx(SetupStep, { label: "Wiki scope", state: "done", detail: "openwiki/" })) : null] })] }), _jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsx(Text, { color: "gray", children: "Set up" }), _jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsx(SetupStep, { label: "Provider", state: resolveStepStatus("provider", step, hasValidConfiguredProvider() || providerConfirmed), detail: getProviderLabel(provider) }), providerUsesAwsSdkCredentials(provider) ? (_jsx(SetupStep, { label: "AWS credentials", state: getMissingProviderEnvKey(provider) === null ? "done" : "pending", detail: getCredentialSetupDetail(provider) })) : providerUsesOAuth(provider) || primaryCredentialStep ? (_jsx(SetupStep, { label: providerUsesOAuth(provider) ? "ChatGPT login" : "Provider key", state: resolveStepStatus(primaryCredentialStep ?? "provider", step, apiKey !== null ||
                                    isCredentialConfigured(provider) ||
                                    oauthTokens !== null), detail: providerUsesOAuth(provider)
                                    ? getCredentialSetupDetail(provider, oauthTokens)
                                    : apiKeyEnvKey && getShellEnvValue(apiKeyEnvKey) !== undefined
                                        ? "from shell"
                                        : apiKey !== null || isCredentialConfigured(provider)
                                            ? "configured"
                                            : "not set" })) : null, providerRequiresSecretKey(provider) ? (_jsx(SetupStep, { label: "Secret key", state: resolveStepStatus("secret-key", step, secretKey !== null || isSecretKeyConfigured(provider)), detail: secretKey !== null || isSecretKeyConfigured(provider)
                                    ? "configured"
                                    : "not set" })) : null, projectEnvKey ? (_jsx(SetupStep, { label: "GCP project", state: resolveStepStatus("gcp-project", step, gcpProject !== null || process.env[projectEnvKey] !== undefined), detail: gcpProject ??
                                    (process.env[projectEnvKey] ? "configured" : "not set") })) : null, projectEnvKey && locationEnvKey ? (_jsx(SetupStep, { label: "GCP location", state: resolveStepStatus("gcp-location", step, gcpLocation !== null ||
                                    process.env[locationEnvKey] !== undefined, "optional"), detail: gcpLocation ??
                                    (process.env[locationEnvKey]
                                        ? "configured"
                                        : `default ${DEFAULT_VERTEX_LOCATION}`) })) : null, providerRequiresBaseUrl(provider) ? (_jsx(SetupStep, { label: "Base URL", state: resolveStepStatus("base-url", step, baseUrl !== null || isBaseUrlConfigured(provider)), detail: baseUrl ??
                                    (isBaseUrlConfigured(provider) ? "configured" : "not set") })) : null, providerRequiresRegion(provider) ? (_jsx(SetupStep, { label: "Region", state: resolveStepStatus("region", step, region !== null || isRegionConfigured(provider)), detail: region ??
                                    (isRegionConfigured(provider) ? "configured" : "not set") })) : null, _jsx(SetupStep, { label: "Model", state: resolveStepStatus("model", step, modelId !== null ||
                                    modelIdOverride !== null ||
                                    process.env[OPENWIKI_MODEL_ID_ENV_KEY] !== undefined), detail: modelId ?? getModelSetupDetail(modelIdOverride, provider) }), reasoningEffortOptions.length > 0 ? (_jsx(SetupStep, { label: "Reasoning effort", state: resolveStepStatus("reasoning-effort", step, reasoningEffort !== null ||
                                    process.env[OPENWIKI_REASONING_EFFORT_ENV_KEY] !== undefined, "optional"), detail: reasoningEffort ??
                                    process.env[OPENWIKI_REASONING_EFFORT_ENV_KEY] ??
                                    "provider default" })) : null, _jsx(SetupStep, { label: "LangSmith", state: resolveStepStatus("langsmith", step, 
                                // Answered when a key exists (this session or in env) or a tracing
                                // decision was recorded; !needsLangSmithStep() covers both, so a
                                // prior decline reads done instead of resetting to optional.
                                langSmithKey !== null || !needsLangSmithStep(), "optional"), detail: langSmithKey !== null
                                    ? langSmithKey.length > 0
                                        ? "configured"
                                        : "skipped"
                                    : process.env.LANGSMITH_API_KEY
                                        ? "configured"
                                        : // A recorded tracing decision with no key means the step was
                                            // seen and declined on an earlier run, so it reads "skipped".
                                            process.env.LANGCHAIN_TRACING_V2 !== undefined
                                                ? "skipped"
                                                : "not set" }), selectedMode === "personal" ? (_jsx(SetupStep, { label: "Wiki scope", state: resolveStepStatus("wiki-goal", step, Boolean(onboardingConfig.wikiGoal)), detail: onboardingConfig.wikiGoal ? "configured" : "not set" })) : null, selectedMode === "personal" ? (_jsx(SetupStep, { label: "Schedule", state: isScheduleStep(step)
                                    ? "current"
                                    : onboardingConfig.ingestionSchedule
                                        ? "done"
                                        : "pending", detail: onboardingConfig.ingestionSchedule
                                    ? onboardingConfig.ingestionSchedule.description
                                    : "not set" })) : null, selectedMode === "personal" ? (_jsx(SetupStep, { label: "Sources", state: isSourceStep(step)
                                    ? "current"
                                    : getConnectedSourceCount(onboardingConfig, activeSourceOptions) > 0
                                        ? "done"
                                        : "pending", detail: `${getConnectedSourceCount(onboardingConfig, activeSourceOptions)} configured` })) : null] })] }), step === "oauth-login" ? (_jsx(OAuthLoginPrompt, { copied: copied, input: input, isLoggingIn: isLoggingIn, loginUrl: loginUrl, provider: provider })) : (_jsx(SetupPanel, { title: "Prompt", children: step ? (_jsx(Prompt, { codeRepoPathInput: codeRepoPathInput, codeRepoRoot: codeRepoRoot, externalCliAuth: externalCliAuth, codeRepoSelectionIndex: codeRepoSelectionIndex, cronFieldSelectionIndex: cronFieldSelectionIndex, cronModeSelectionIndex: cronModeSelectionIndex, finalSelectionIndex: finalSelectionIndex, input: input, inputDisplayWidth: inputDisplayWidth, isCustomModelInput: isCustomModelInput, langsmithDraft: langsmithDraft, langsmithRegionSelectionIndex: langsmithRegionSelectionIndex, langsmithWorkspaceSelectionIndex: langsmithWorkspaceSelectionIndex, langsmithWorkspaces: langsmithWorkspaces, modelSelectionIndex: modelSelectionIndex, reasoningEffortOptions: reasoningEffortOptions, reasoningEffortSelectionIndex: reasoningEffortSelectionIndex, onboardingConfig: onboardingConfig, powerModeSelectionIndex: powerModeSelectionIndex, provider: provider, providerSelectionIndex: providerSelectionIndex, runModeSelectionIndex: runModeSelectionIndex, secretInputIndex: secretInputIndex, selectedMode: selectedMode, selectedSource: selectedSource, sourceOptions: activeSourceOptions, sourceContinueSelectionIndex: sourceContinueSelectionIndex, sourceDescriptionSelectionIndex: sourceDescriptionSelectionIndex, sourceSelectionIndex: sourceSelectionIndex, sourceState: sourceState, step: step, suggestedCronDescription: suggestedCronDescription, suggestedCronExpression: suggestedCronExpression, templateSelectionIndex: templateSelectionIndex })) : (_jsx(Text, { children: "Inspecting OpenWiki setup..." })) })), navHistoryLength > 0 ? (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { color: "gray", children: "esc to go back" }) })) : null, needsCredentialPrompt ? (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { color: "gray", children: "Secrets are masked and saved only after setup." }) })) : null, notice ? (_jsx(SetupPanel, { title: "Status", children: _jsx(Text, { color: "cyan", children: notice }) })) : null, error ? (_jsx(SetupPanel, { title: "Error", children: _jsx(Text, { color: "red", children: error }) })) : null, sourceState.savedScheduleWarning ? (_jsx(SetupPanel, { title: "Schedule note", children: _jsx(Text, { color: "yellow", children: sourceState.savedScheduleWarning }) })) : null, isSaving ? (_jsx(SetupPanel, { title: "Saving", children: _jsx(Text, { children: "Writing OpenWiki setup..." }) })) : null, isAuthRunning ? (_jsx(SetupPanel, { title: "Authorization", children: _jsx(Text, { children: "Waiting for the browser authorization callback..." }) })) : null] }));
}
