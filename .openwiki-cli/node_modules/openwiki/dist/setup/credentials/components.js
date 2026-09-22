import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { openWikiEnvDisplayPath } from "../../config/openwiki-home.js";
import { DEFAULT_PROVIDER, DEFAULT_VERTEX_LOCATION, getDefaultModelId, getProviderApiKeyEnvKey, getProviderBaseUrlEnvKey, getProviderLabel, getProviderLocationEnvKey, getProviderProjectEnvKey, getProviderRegionEnvKey, getProviderRegionEnvKeys, getProviderSecretKeyEnvKey, OPENWIKI_MODEL_ID_ENV_KEY, resolveProviderRegion, SELECTABLE_OPENWIKI_PROVIDERS, } from "../../config/constants.js";
import { getExternalCliAuthAdapter, } from "../../auth/external-cli-auth.js";
import { validateCronExpression } from "../../scheduling/schedules.js";
import { getApiKeyFieldLabel, getConfigModeName, getConnectedSourceCount, getCronFields, getFinalOptionLabel, getLangsmithRegionLabel, getModelSelectionOptions, getProviderArticle, getSourceDescriptionPrompt, getSourceInstanceCount, getSourceInstances, getSourceMenuLabel, isCodeMode, } from "./steps.js";
import { formatSecretInputDisplay, formatTerminalHyperlink, getAwsCredentialRepairMessage, getOAuthAuthorizationStatusText, getSingleLineInputDisplayValue, mask, } from "./format.js";
import { CODE_REPO_OPTIONS, CRON_FIELD_LABELS, CRON_MODE_OPTIONS, FINAL_OPTIONS, LANGSMITH_REGION_OPTIONS, ONBOARDING_TEMPLATES, POWER_MODE_OPTIONS, RUN_MODE_OPTIONS, SOURCE_CONTINUE_OPTIONS, STEP_COLOR, STEP_GLYPH, } from "./constants.js";
export function Prompt({ codeRepoPathInput, codeRepoRoot, codeRepoSelectionIndex, externalCliAuth, cronFieldSelectionIndex, cronModeSelectionIndex, finalSelectionIndex, input, inputDisplayWidth, isCustomModelInput, langsmithDraft, langsmithRegionSelectionIndex, langsmithWorkspaceSelectionIndex, langsmithWorkspaces, modelSelectionIndex, reasoningEffortOptions = [], reasoningEffortSelectionIndex = 0, onboardingConfig, powerModeSelectionIndex, provider, providerSelectionIndex, runModeSelectionIndex, secretInputIndex, selectedMode, selectedSource, sourceOptions, sourceContinueSelectionIndex, sourceDescriptionSelectionIndex, sourceSelectionIndex, sourceState, step, suggestedCronDescription, suggestedCronExpression, templateSelectionIndex, }) {
    if (step === "run-mode") {
        const selectedMode = RUN_MODE_OPTIONS[runModeSelectionIndex] ?? RUN_MODE_OPTIONS[0];
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose what OpenWiki should initialize." }), RUN_MODE_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === runModeSelectionIndex }), " ", option.name, " ", _jsxs(Text, { color: "gray", children: ["(", option.id, ")"] })] }, option.id))), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, children: selectedMode.name }), _jsx(Text, { color: "gray", children: selectedMode.description })] }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "provider") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose a model provider." }), SELECTABLE_OPENWIKI_PROVIDERS.map((providerOption, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === providerSelectionIndex }), " ", getProviderLabel(providerOption), _jsxs(Text, { color: "gray", children: [" (", providerOption, ")"] }), providerOption === DEFAULT_PROVIDER ? (_jsx(Text, { color: "gray", children: " default" })) : null] }, providerOption))), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "api-key") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Paste your ", getApiKeyFieldLabel(provider), "."] }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: `${getProviderApiKeyEnvKey(provider)}=`, secret: true, value: input }), _jsx(Text, { color: "gray", children: "Press Enter to save it." })] }));
    }
    if (step === "external-cli-auth") {
        return (_jsx(ExternalCliAuthPrompt, { authState: externalCliAuth, input: input, provider: provider }));
    }
    if (step === "secret-key") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Paste your ", getProviderLabel(provider), " secret access key."] }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: `${getProviderSecretKeyEnvKey(provider)}=`, secret: true, value: input }), _jsx(Text, { color: "gray", children: "Press Enter to save it." })] }));
    }
    if (step === "gcp-project") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Enter the Google Cloud project ID with Vertex AI access." }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " ", getProviderProjectEnvKey(provider), "=", " ", _jsx(Text, { color: "yellow", children: input })] }), _jsx(Text, { color: "gray", children: "OpenWiki authenticates with Google Application Default Credentials (run: gcloud auth application-default login). Press Enter to save it." })] }));
    }
    if (step === "gcp-location") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Enter a Vertex AI location, or press Enter to use", " ", DEFAULT_VERTEX_LOCATION, "."] }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " ", getProviderLocationEnvKey(provider), "=", " ", _jsx(Text, { color: "yellow", children: input })] }), _jsx(Text, { color: "gray", children: "For example global, europe-west1, or us-east5. Press Enter to continue." })] }));
    }
    if (step === "base-url") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Enter the ", getProviderLabel(provider), " base URL."] }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " ", getProviderBaseUrlEnvKey(provider), "=", " ", _jsx(Text, { color: "yellow", children: input })] }), _jsx(Text, { color: "gray", children: "For example an OpenAI-compatible gateway endpoint (such as a LiteLLM gateway). Press Enter to save it." })] }));
    }
    if (step === "region") {
        const resolvedRegion = resolveProviderRegion(provider);
        const credentialRepairMessage = getAwsCredentialRepairMessage(provider);
        return (_jsxs(Box, { flexDirection: "column", children: [credentialRepairMessage ? (_jsxs(Text, { color: "yellow", children: ["\u26A0 ", credentialRepairMessage] })) : null, _jsxs(Text, { children: ["Enter the ", getProviderLabel(provider), " region", resolvedRegion ? `, or press Enter to keep ${resolvedRegion}` : "", "."] }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " ", getProviderRegionEnvKey(provider), "=", " ", _jsx(Text, { color: "yellow", children: input })] }), _jsxs(Text, { color: "gray", children: ["Uses ", getProviderRegionEnvKeys(provider).join(", "), ". For example us-east-1."] })] }));
    }
    if (step === "model") {
        if (isCustomModelInput) {
            return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Paste a custom model ID." }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: `${OPENWIKI_MODEL_ID_ENV_KEY}=`, value: input }), _jsx(Text, { color: "gray", children: "Press Enter to save it." })] }));
        }
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Choose ", getProviderArticle(provider), " ", getProviderLabel(provider), " ", "model."] }), getModelSelectionOptions(provider).map((option, index) => {
                    if (option.kind === "custom") {
                        return (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === modelSelectionIndex }), " ", "Custom model ID"] }, "custom"));
                    }
                    return (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === modelSelectionIndex }), " ", option.label, " ", _jsx(Text, { color: "gray", children: option.id }), option.id === getDefaultModelId(provider) ? (_jsx(Text, { color: "gray", children: " default" })) : null] }, option.id));
                }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "reasoning-effort") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose the reasoning effort for this model." }), reasoningEffortOptions.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === reasoningEffortSelectionIndex }), " ", option.label, option.value === "" ? (_jsx(Text, { color: "gray", children: " preserves the provider setting" })) : null] }, option.value || "provider-default"))), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "langsmith") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Optional: paste a LangSmith API key for tracing." }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: "LANGSMITH_API_KEY optional=", secret: true, value: input }), _jsx(Text, { color: "gray", children: "Press Enter with an empty value to skip." })] }));
    }
    if (step === "template") {
        const selectedTemplate = ONBOARDING_TEMPLATES[templateSelectionIndex] ?? ONBOARDING_TEMPLATES[0];
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose how OpenWiki should run." }), ONBOARDING_TEMPLATES.map((template, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === templateSelectionIndex }), " ", template.name] }, template.id))), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, children: selectedTemplate.name }), _jsx(Text, { color: "gray", children: selectedTemplate.description }), selectedTemplate.suggestedSources.length > 0 ? (_jsxs(Text, { color: "gray", children: ["Suggested sources: ", selectedTemplate.suggestedSources.join(", ")] })) : (_jsx(Text, { color: "gray", children: "Start from a blank wiki brief." }))] }), _jsx(Text, { color: "gray", children: "Press Enter, then edit the brief on the next step." })] }));
    }
    if (step === "wiki-goal") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Customize what this wiki should understand." }), getConfigModeName(onboardingConfig) ? (_jsxs(Text, { color: "gray", children: ["Mode: ", getConfigModeName(onboardingConfig)] })) : null, _jsx(Text, { color: "gray", children: "Edit the brief below. Keep what is useful, delete what is not." }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, children: "Edit wiki brief" }), _jsx(BorderedMultilineInput, { maxDisplayWidth: inputDisplayWidth, value: input })] }), _jsx(Text, { color: "gray", children: "Press Enter to continue." })] }));
    }
    if (step === "code-repo-confirm") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Use this repository?" }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: "cyan", children: codeRepoRoot }) }), _jsx(Text, { color: "gray", children: "OpenWiki will run in this directory and write the initial openwiki/ folder there." }), _jsx(Box, { flexDirection: "column", marginTop: 1, children: CODE_REPO_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === codeRepoSelectionIndex }), " ", option] }, option))) }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "code-repo-path") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose the repository directory." }), _jsx(Text, { color: "gray", children: "Enter an existing directory. OpenWiki will write openwiki/ there." }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: "path=", value: codeRepoPathInput }), _jsx(Text, { color: "gray", children: "Press Enter to confirm this path." })] }));
    }
    if (step === "source-menu") {
        // LangSmith workspaces live in state until setup completes (not onboarding
        // source instances), so count them here for the menu's configured display.
        const langsmithWorkspaceCount = sourceOptions.some((source) => source.id === "langsmith")
            ? langsmithWorkspaces.length
            : 0;
        const configuredCount = getConnectedSourceCount(onboardingConfig, sourceOptions) +
            langsmithWorkspaceCount;
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Configure sources for this mode." }), sourceOptions.map((source, index) => {
                    const isLangsmith = source.id === "langsmith";
                    const sourceInstances = getSourceInstances(onboardingConfig, source.id);
                    const count = isLangsmith
                        ? langsmithWorkspaces.length
                        : sourceInstances.length;
                    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === sourceSelectionIndex }), " ", getSourceMenuLabel(source, count), " ", _jsx(SourceConnectionStatus, { count: count, isConfigured: count > 0 })] }), isLangsmith
                                ? langsmithWorkspaces.map((workspace) => (_jsxs(Text, { color: "gray", children: ["  ", "- ", getLangsmithRegionLabel(workspace.region), ":", " ", workspace.projects.join(", ")] }, workspace.apiKeyEnv)))
                                : sourceInstances.map((sourceInstance) => (_jsxs(Text, { color: "gray", children: ["  ", "- ", sourceInstance.name ?? sourceInstance.id, " ", _jsxs(Text, { color: "gray", children: ["(", sourceInstance.id, ")"] })] }, sourceInstance.id)))] }, source.id));
                }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: "Next" }), _jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: sourceSelectionIndex === sourceOptions.length }), " ", "Continue", " ", configuredCount === 0 ? (_jsx(Text, { color: "gray", children: "(no sources configured)" })) : null] })] }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "source-path") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose the local Git repository directory." }), _jsx(Text, { color: "gray", children: "Default is the directory where you started OpenWiki. Edit it to use a different checkout." }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: "path=", value: input }), _jsx(Text, { color: "gray", children: "Press Enter to save this source." })] }));
    }
    if (step === "source-secret") {
        const secretInput = selectedSource.secretInputs[secretInputIndex];
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [selectedSource.displayName, " setup"] }), selectedSource.instructions.map((instruction, index) => (_jsxs(Text, { children: [index + 1, ". ", instruction] }, instruction))), secretInput ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, children: "Enter credential" }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, prefix: `${secretInput.envKey}${secretInput.optional ? " optional" : ""}=`, secret: true, value: input }), _jsx(Text, { color: "gray", children: secretInput.optional
                                ? "Press Enter with an empty value to skip."
                                : "Press Enter to save this value." })] })) : null] }));
    }
    if (step === "source-auth") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [selectedSource.displayName, " authorization"] }), sourceState.authUrl ? (_jsx(OAuthAuthorizationLink, { authProvider: selectedSource.authProvider, copiedToClipboard: Boolean(sourceState.copiedAuthUrlToClipboard), url: sourceState.authUrl })) : (_jsx(Text, { color: "gray", children: "Press Enter to open the authorization URL and wait for the callback." }))] }));
    }
    if (step === "source-description") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: getSourceDescriptionPrompt(selectedSource) }), _jsx(Text, { color: "gray", children: "Choose an example description, or write your own." }), selectedSource.examples.map((example, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === sourceDescriptionSelectionIndex }), " ", example] }, example))), _jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: sourceDescriptionSelectionIndex >= selectedSource.examples.length }), " ", "Custom description"] }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "source-description-custom") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: getSourceDescriptionPrompt(selectedSource) }), _jsx(Text, { color: "gray", children: "Type what OpenWiki should focus on for this source." }), _jsx(BorderedMultilineInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, value: input }), _jsx(Text, { color: "gray", children: "Optional. Press Enter to continue." })] }));
    }
    if (step === "source-langsmith-workspaces") {
        const workspaceCount = langsmithWorkspaces.length;
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "LangSmith workspaces to document." }), _jsx(Text, { color: "gray", children: "A LangSmith key is region-bound, so each workspace has its own region and key. Select one to edit (clear its projects to remove it)." }), langsmithWorkspaces.map((workspace, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === langsmithWorkspaceSelectionIndex }), " ", getLangsmithRegionLabel(workspace.region), ":", " ", workspace.projects.join(", ")] }, workspace.apiKeyEnv))), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: langsmithWorkspaceSelectionIndex === workspaceCount }), " ", "Add a workspace"] }), _jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: langsmithWorkspaceSelectionIndex === workspaceCount + 1 }), " ", "Done"] })] }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "source-langsmith-key") {
        const apiKeyEnv = langsmithDraft?.apiKeyEnv ?? "OPENWIKI_LANGSMITH_API_KEY";
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "LangSmith API key for this workspace." }), _jsxs(Text, { color: "gray", children: ["The connector's own read key (not your app's tracing key). Saved to ", openWikiEnvDisplayPath, " as ", apiKeyEnv, ", never committed."] }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: `${apiKeyEnv}=`, secret: true, value: input }), _jsx(Text, { color: "gray", children: "Press Enter to confirm (empty keeps the saved key)." })] }));
    }
    if (step === "source-langsmith-projects") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Which projects should this wiki document in this workspace?" }), _jsx(Text, { color: "gray", children: "Comma-separated project names (as in LANGCHAIN_PROJECT). Written to openwiki/.langsmith.json." }), _jsx(BorderedMultilineInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, value: input }), _jsx(Text, { color: "gray", children: "Press Enter to confirm." })] }));
    }
    if (step === "source-langsmith-region") {
        const selectedRegion = LANGSMITH_REGION_OPTIONS[langsmithRegionSelectionIndex] ??
            LANGSMITH_REGION_OPTIONS[0];
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Which LangSmith region is this workspace in?" }), LANGSMITH_REGION_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === langsmithRegionSelectionIndex }), " ", option.name, " ", _jsxs(Text, { color: "gray", children: ["(", option.host, ")"] })] }, option.id))), _jsx(Box, { flexDirection: "column", marginTop: 1, children: _jsx(Text, { color: "gray", children: selectedRegion.description }) }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "global-cron-mode") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: isCodeMode(onboardingConfig)
                        ? "When should GitHub Actions refresh this code wiki?"
                        : "When should OpenWiki run all ingestion?" }), _jsx(Text, { color: "gray", children: isCodeMode(onboardingConfig)
                        ? "OpenWiki will write a scheduled GitHub Actions workflow for this repository."
                        : "All configured sources run sequentially at this time." }), _jsxs(Text, { color: "gray", children: ["Suggested: ", suggestedCronDescription] }), CRON_MODE_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === cronModeSelectionIndex }), " ", option] }, option))), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "global-cron-custom") {
        const validation = validateCronExpression(input);
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: isCodeMode(onboardingConfig)
                        ? "Enter one GitHub Actions cron schedule for this code wiki."
                        : "Enter one cron schedule for all ingestion." }), _jsx(SegmentedCronInput, { activeFieldIndex: cronFieldSelectionIndex, expression: input, fallbackExpression: suggestedCronExpression, maxDisplayWidth: inputDisplayWidth }), input ? (_jsx(Text, { color: validation.valid ? "cyan" : "red", children: validation.valid ? validation.description : validation.error })) : (_jsx(Text, { color: "gray", children: "Example: 0 2 * * *" })), _jsx(Text, { color: "gray", children: "Type in each field. Use right/left arrows or Tab to move; spaces also move fields." }), _jsx(Text, { color: "gray", children: "Press Enter to save a valid schedule." })] }));
    }
    if (step === "global-power-mode") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Keep your Mac awake for scheduled refreshes?" }), _jsx(Text, { color: "gray", children: "OpenWiki can use macOS pmset to wake 2 minutes before the shared ingestion schedule and sleep 30 minutes after it." }), sourceState.savedScheduleWarning ? (_jsx(Text, { color: "yellow", children: sourceState.savedScheduleWarning })) : null, _jsx(Box, { flexDirection: "column", marginTop: 1, children: POWER_MODE_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === powerModeSelectionIndex }), " ", option] }, option))) }), _jsx(Text, { color: "gray", children: "macOS has one global repeat power schedule. Setting this can replace an existing pmset repeat wake/sleep schedule." })] }));
    }
    if (step === "source-confirm-continue") {
        const missingSources = sourceOptions.filter((source) => getSourceInstanceCount(onboardingConfig, source.id) === 0);
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Some sources for this mode are not configured yet." }), missingSources.map((source) => (_jsxs(Text, { color: "gray", children: ["- ", source.displayName] }, source.id))), _jsx(Box, { flexDirection: "column", marginTop: 1, children: SOURCE_CONTINUE_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === sourceContinueSelectionIndex }), " ", option] }, option))) }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "final") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Setup is complete." }), FINAL_OPTIONS.map((option, index) => {
                    const label = getFinalOptionLabel(option, selectedMode);
                    return (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === finalSelectionIndex }), " ", label] }, option));
                }), _jsx(Text, { color: "gray", children: selectedMode === "code"
                        ? "Run now writes the initial openwiki/ directory. Open chat skips the initial run."
                        : "Run now executes one source-specific ingestion and wiki update per configured source. Run later opens chat so you can start ingestion when you are ready." })] }));
    }
    return null;
}
export function ExternalCliAuthPrompt({ authState, input, provider, }) {
    const adapter = getExternalCliAuthAdapter(provider);
    const envKey = getProviderApiKeyEnvKey(provider) ?? "API key";
    if (!adapter) {
        return null;
    }
    if (authState.kind === "idle" || authState.kind === "checking") {
        return (_jsxs(Text, { color: "gray", children: ["Checking for an existing ", adapter.credentialDescription, "..."] }));
    }
    if (authState.kind === "logging-in") {
        return (_jsxs(Text, { color: "gray", children: ["Running `", adapter.loginCommand, "` \u2014 follow the prompts in this terminal..."] }));
    }
    if (authState.kind === "detected") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Detected an existing ", adapter.credentialDescription, "."] }), _jsx(Text, { color: "gray", children: "Press Enter to use it, Tab to sign in again, or paste a different token below." }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " ", envKey, "=", " ", _jsx(Text, { color: "yellow", children: input.length > 0 ? mask(input) : `<from ${adapter.name}>` })] })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["No ", adapter.credentialDescription, " detected."] }), authState.kind === "login-failed" ? (_jsxs(Text, { color: "red", children: ["`", adapter.loginCommand, "` did not complete successfully."] })) : null, authState.kind === "not-detected" && authState.cliAvailable ? (_jsxs(Text, { color: "gray", children: ["Press Tab to run `", adapter.loginCommand, "`, or paste a token below."] })) : (_jsxs(Text, { color: "gray", children: [adapter.installHint, " You can also paste a token below for CI or other headless use."] })), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " ", envKey, "=", " ", _jsx(Text, { color: "yellow", children: mask(input) })] }), _jsx(Text, { color: "gray", children: "Press Enter to save it." })] }));
}
export function SetupHeader() {
    return (_jsxs(Box, { borderStyle: "round", borderColor: "cyan", flexDirection: "column", marginBottom: 1, paddingX: 1, children: [_jsxs(Text, { children: [_jsx(Text, { bold: true, color: "cyan", children: "OpenWiki" }), " ", _jsx(Text, { color: "gray", children: "first-run setup" })] }), _jsx(Text, { children: "Configure the model, wiki scope, and sources." })] }));
}
export function SetupStep({ detail, label, state, }) {
    return (_jsxs(Text, { children: [_jsx(Text, { color: STEP_COLOR[state], children: STEP_GLYPH[state] }), " ", _jsx(Text, { bold: state === "current" || state === "done", children: label.padEnd(16) }), " ", _jsx(Text, { color: "gray", children: detail })] }));
}
export function SetupPanel({ children, title, }) {
    return (_jsxs(Box, { borderStyle: "single", borderColor: "gray", flexDirection: "column", marginTop: 1, paddingX: 1, children: [_jsx(Text, { bold: true, color: "cyan", children: title }), children] }));
}
export function SelectionMarker({ isSelected }) {
    return (_jsx(Text, { color: isSelected ? "cyan" : "gray", children: isSelected ? ">" : " " }));
}
export function SourceConnectionStatus({ count, isConfigured, }) {
    return (_jsx(Text, { color: isConfigured ? "green" : "gray", children: isConfigured
            ? `[configured${count > 1 ? ` x${count}` : ""}]`
            : "[not configured]" }));
}
export function OAuthAuthorizationLink({ authProvider, copiedToClipboard, url, }) {
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { children: _jsx(Text, { color: "cyan", underline: true, children: formatTerminalHyperlink(url, "Open authorization URL") }) }), _jsx(Text, { color: copiedToClipboard ? "green" : "gray", children: getOAuthAuthorizationStatusText({
                    authProvider,
                    copiedToClipboard,
                }) })] }));
}
export function OAuthLoginPrompt({ copied, input, isLoggingIn, loginUrl, provider, }) {
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, color: "cyan", children: "ChatGPT login" }), _jsxs(Text, { children: ["Sign in with your ", getProviderLabel(provider), " account to authorize OpenWiki."] }), loginUrl ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: "Opening your browser. If it does not open, copy this URL:" }), _jsx(Text, { color: "cyan", wrap: "wrap", children: loginUrl }), _jsxs(Text, { color: "gray", children: ["Press ", _jsx(Text, { bold: true, children: "c" }), " to copy the URL", copied ? _jsx(Text, { color: "green", children: " (copied)" }) : null] }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: "If the browser cannot reach this machine, paste the redirect URL or authorization code and press Enter:" }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "> " }), input.length > 0 ? (_jsx(Text, { color: "yellow", children: input })) : (_jsx(Text, { color: "gray", children: "(paste here)" }))] })] })] })) : (_jsx(Text, { color: "gray", children: "Starting the ChatGPT login..." })), _jsx(Text, { color: "gray", children: isLoggingIn
                    ? "Waiting for browser sign-in or pasted URL..."
                    : "Login failed. Press Enter to retry." })] }));
}
export function BorderedInput({ borderColor = "cyan", maxDisplayWidth, marginTop, prefix, secret = false, showCursor = true, value, }) {
    const prompt = prefix ? "$ " : "> ";
    const prefixText = prefix ? `${prefix} ` : "";
    const valueDisplayWidth = Math.max(1, maxDisplayWidth - prompt.length - prefixText.length - (showCursor ? 1 : 0));
    return (_jsx(Box, { borderStyle: "single", borderColor: borderColor, marginTop: marginTop, paddingX: 1, width: maxDisplayWidth + 4, children: _jsxs(Text, { wrap: "truncate", children: [_jsx(Text, { color: "gray", children: prompt }), prefixText ? _jsx(Text, { color: "gray", children: prefixText }) : null, _jsx(InputValueWithCursor, { maxDisplayWidth: valueDisplayWidth, secret: secret, showCursor: showCursor, value: value })] }) }));
}
export function BorderedMultilineInput({ borderColor = "cyan", maxDisplayWidth, marginTop, showCursor = true, value, }) {
    return (_jsx(Box, { borderStyle: "single", borderColor: borderColor, flexDirection: "column", marginTop: marginTop, paddingX: 1, width: maxDisplayWidth + 4, children: _jsxs(Text, { wrap: "wrap", children: [_jsx(Text, { color: "gray", children: "> " }), value ? _jsx(Text, { color: "yellow", children: value }) : null, showCursor ? _jsx(Text, { inverse: true, children: " " }) : null] }) }));
}
export function InputValueWithCursor({ maxDisplayWidth, secret = false, showCursor = true, value, }) {
    if (secret) {
        const displayValue = getSingleLineInputDisplayValue(formatSecretInputDisplay(value), maxDisplayWidth);
        return (_jsxs(_Fragment, { children: [_jsx(Text, { color: value.length > 0 ? "yellow" : "gray", children: displayValue }), showCursor ? _jsx(Text, { inverse: true, children: " " }) : null] }));
    }
    const displayValue = getSingleLineInputDisplayValue(value, maxDisplayWidth);
    return (_jsxs(_Fragment, { children: [displayValue ? _jsx(Text, { color: "yellow", children: displayValue }) : null, showCursor ? _jsx(Text, { inverse: true, children: " " }) : null] }));
}
export function SegmentedCronInput({ activeFieldIndex, expression, fallbackExpression, maxDisplayWidth, }) {
    const fields = getCronFields(expression, fallbackExpression);
    const fieldDisplayWidth = Math.max(8, Math.min(14, Math.floor(maxDisplayWidth / CRON_FIELD_LABELS.length) - 1));
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Box, { children: fields.map((field, index) => (_jsxs(Box, { flexDirection: "column", marginRight: 1, children: [_jsx(Text, { color: "gray", children: CRON_FIELD_LABELS[index] }), _jsx(BorderedInput, { borderColor: index === activeFieldIndex ? "cyan" : "gray", maxDisplayWidth: fieldDisplayWidth, showCursor: index === activeFieldIndex, value: field })] }, CRON_FIELD_LABELS[index]))) }), _jsxs(Text, { color: "gray", children: ["Cron: ", fields.join(" ")] })] }));
}
