import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { openWikiEnvDisplayPath } from "../../config/openwiki-home.js";
import { getDefaultModelId, getProviderApiKeyEnvKey, getProviderCredentialHint, getProviderLabel, getProviderModelOptions, getProviderProjectEnvKey, isValidModelId, normalizeModelId, normalizeProvider, OPENWIKI_REASONING_EFFORT_ENV_KEY, providerUsesAwsSdkCredentials, SELECTABLE_OPENWIKI_PROVIDERS, } from "../../config/constants.js";
import { getReasoningCapability, isReasoningEffort, } from "../../config/reasoning.js";
import { saveOpenWikiEnv } from "../../config/env.js";
import { applyRawInputValue, deleteAtInputCursor, deleteBeforeInputCursor, isEscapeInput, isRawBackspaceInput, moveInputCursor, } from "../input/cursor.js";
import { getCurrentModelOptionIndex, getCurrentReasoningEffortOptionIndex, getCurrentProviderOptionIndex, getModelMenuOptions, getReasoningEffortMenuOptions, isMenuDownInput, isMenuUpInput, moveMenuSelection, parseSlashInput, slashCommandOptions, syncMenuStateForInput, } from "../input/menu.js";
import { formatSecretInputSummary } from "../input/secret.js";
import { formatCwd } from "../format.js";
import { formatRunCompletionTitle } from "../run-log/summary.js";
import { InputCursor, MenuRow, PromptBlock } from "./primitives.js";
import { CompletedRunDetails } from "./run-view.js";
/**
 * The scrollback of completed runs: each run's prompt, status line, and log.
 */
export function ChatHistory({ runs }) {
    if (runs.length === 0) {
        return null;
    }
    return (_jsx(Box, { flexDirection: "column", children: runs.map((run) => (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [run.message ? _jsx(PromptBlock, { message: run.message }) : null, _jsxs(Text, { children: [_jsx(Text, { color: "green", children: "\u2713 " }), _jsx(Text, { bold: true, children: formatRunCompletionTitle(run.command, run.log, run.durationMs) }), " ", _jsxs(Text, { color: "gray", children: ["\u00B7 ", run.result.model, run.reasoningEffort ? ` (effort: ${run.reasoningEffort})` : ""] })] }), _jsx(Box, { flexDirection: "column", marginLeft: 2, marginTop: 1, children: run.log.length > 0 ? (_jsx(CompletedRunDetails, { command: "chat", log: run.log })) : (_jsx(Text, { color: "gray", children: "No assistant output captured." })) })] }, run.id))) }));
}
/**
 * The interactive follow-up prompt: handles keystrokes, the slash-command menu,
 * and masked credential entry. Secret values are never echoed; only a masked
 * length summary is shown, and keys are persisted via saveOpenWikiEnv.
 */
export function ChatInput({ currentModelId, currentProvider, currentReasoningEffort, onClear, onCommandRun, onModelSelect, onProviderSelect, onReasoningEffortSelect, onSubmit, }) {
    const [inputState, setInputState] = useState({
        cursorPosition: 0,
        value: "",
    });
    const [menuState, setMenuState] = useState({
        kind: "none",
    });
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [secretInputMode, setSecretInputMode] = useState(null);
    const input = inputState.value;
    const cursorPosition = inputState.cursorPosition;
    useEffect(() => {
        if (secretInputMode !== null) {
            return;
        }
        setMenuState((currentState) => syncMenuStateForInput(input, currentState, currentModelId, currentProvider, currentReasoningEffort));
    }, [
        currentModelId,
        currentProvider,
        currentReasoningEffort,
        input,
        secretInputMode,
    ]);
    useInput((inputValue, key) => {
        if (isSaving) {
            return;
        }
        if (secretInputMode !== null) {
            if (isEscapeInput(inputValue, key)) {
                resetInput();
                setSecretInputMode(null);
                setNotice("Credential update canceled.");
                return;
            }
            if (key.return) {
                void saveSecretInput();
                return;
            }
            if (key.backspace || isRawBackspaceInput(inputValue)) {
                setInputState(deleteBeforeInputCursor);
                return;
            }
            if (key.delete) {
                setInputState(inputValue.length === 0
                    ? deleteBeforeInputCursor
                    : deleteAtInputCursor);
                return;
            }
            if (inputValue && !key.ctrl && !key.meta) {
                setError(null);
                setNotice(null);
                setInputState((state) => applyRawInputValue(state, inputValue));
            }
            return;
        }
        if (isMenuUpInput(inputValue, key) && menuState.kind !== "none") {
            setMenuState((state) => moveMenuSelection(state, -1, currentModelId, currentProvider));
            return;
        }
        if (isMenuDownInput(inputValue, key) && menuState.kind !== "none") {
            setMenuState((state) => moveMenuSelection(state, 1, currentModelId, currentProvider));
            return;
        }
        if (key.return) {
            void submitInput();
            return;
        }
        if (isEscapeInput(inputValue, key) && menuState.kind !== "none") {
            resetInput();
            return;
        }
        if (key.leftArrow) {
            setInputState((state) => moveInputCursor(state, -1));
            return;
        }
        if (key.rightArrow) {
            setInputState((state) => moveInputCursor(state, 1));
            return;
        }
        if ((key.ctrl && inputValue === "a") || inputValue === "\u0001") {
            setInputState((state) => ({
                ...state,
                cursorPosition: 0,
            }));
            return;
        }
        if ((key.ctrl && inputValue === "e") || inputValue === "\u0005") {
            setInputState((state) => ({
                ...state,
                cursorPosition: state.value.length,
            }));
            return;
        }
        if (key.backspace || isRawBackspaceInput(inputValue)) {
            setInputState(deleteBeforeInputCursor);
            return;
        }
        if (key.delete) {
            setInputState(inputValue.length === 0 ? deleteBeforeInputCursor : deleteAtInputCursor);
            return;
        }
        if (inputValue && !key.ctrl && !key.meta) {
            setError(null);
            setNotice(null);
            setInputState((state) => applyRawInputValue(state, inputValue));
        }
    });
    async function submitInput() {
        const message = input.trim();
        if (message.length === 0) {
            setError("Enter a follow-up message.");
            return;
        }
        if (message.startsWith("/")) {
            await submitSlashInput(message);
            return;
        }
        resetInput();
        onSubmit(message);
    }
    async function submitSlashInput(message) {
        if (message === "/" && menuState.kind === "commands") {
            await runSlashCommand(slashCommandOptions[menuState.selectedIndex]);
            return;
        }
        if (message === "/model" && menuState.kind === "model") {
            await selectModelMenuOption(menuState.selectedIndex);
            return;
        }
        if (message === "/effort" && menuState.kind === "effort") {
            if (getReasoningEffortMenuOptions(currentProvider, currentModelId)
                .length === 0) {
                setError(`Reasoning effort is not supported for ${getProviderLabel(currentProvider)} model ${currentModelId}.`);
                return;
            }
            await selectReasoningEffortMenuOption(menuState.selectedIndex);
            return;
        }
        if (message === "/provider" && menuState.kind === "provider") {
            await selectProviderMenuOption(menuState.selectedIndex);
            return;
        }
        const parsedCommand = parseSlashInput(message);
        if (parsedCommand === null) {
            setError(`Unknown command: ${message}`);
            return;
        }
        await runSlashCommand(parsedCommand.option, parsedCommand.args.length > 0 ? parsedCommand.args : null);
    }
    async function runSlashCommand(option, args = null) {
        if (!option) {
            setError("Select a slash command.");
            return;
        }
        if (option.id === "model") {
            if (args && args.length > 0) {
                await saveModelSelection(args);
                return;
            }
            setError(null);
            setNotice("Choose a model, or type /model <model-id>.");
            setInputValue("/model");
            setMenuState({
                kind: "model",
                selectedIndex: getCurrentModelOptionIndex(currentModelId, currentProvider),
            });
            return;
        }
        if (option.id === "effort") {
            if (args && args.length > 0) {
                await saveReasoningEffortSelection(args);
                return;
            }
            const effortOptions = getReasoningEffortMenuOptions(currentProvider, currentModelId);
            if (effortOptions.length === 0) {
                setError(`Reasoning effort is not supported for ${getProviderLabel(currentProvider)} model ${currentModelId}.`);
                return;
            }
            setError(null);
            setNotice("Choose a reasoning effort, or type /effort <value|default>.");
            setInputValue("/effort");
            setMenuState({
                kind: "effort",
                selectedIndex: getCurrentReasoningEffortOptionIndex(currentProvider, currentModelId, currentReasoningEffort),
            });
            return;
        }
        if (option.id === "provider") {
            if (args && args.length > 0) {
                await saveProviderSelection(args);
                return;
            }
            setError(null);
            setNotice("Choose a provider, or type /provider <provider-id>.");
            setInputValue("/provider");
            setMenuState({
                kind: "provider",
                selectedIndex: getCurrentProviderOptionIndex(currentProvider),
            });
            return;
        }
        if (option.id === "api-key") {
            if (args && args.length > 0) {
                setError("Use the masked prompt for API keys; do not pass keys inline.");
                return;
            }
            if (providerUsesAwsSdkCredentials(currentProvider)) {
                setError(`${getProviderLabel(currentProvider)} uses the AWS SDK credential chain; /api-key cannot safely configure an access-key pair. ${getProviderCredentialHint(currentProvider) ?? ""} Legacy BEDROCK_AWS_ACCESS_KEY_ID and BEDROCK_AWS_SECRET_ACCESS_KEY values must be configured or removed together in the shell and ${openWikiEnvDisplayPath}.`.trim());
                return;
            }
            const apiKeyEnvKey = getProviderApiKeyEnvKey(currentProvider);
            if (!apiKeyEnvKey) {
                const hint = getProviderCredentialHint(currentProvider);
                setError(`${getProviderLabel(currentProvider)} does not use an API key.${hint ? ` ${hint}` : ""}`);
                return;
            }
            setError(null);
            setNotice(`Paste your ${getProviderLabel(currentProvider)} API key.`);
            setSecretInputMode({
                envKey: apiKeyEnvKey,
                kind: "api-key",
                label: `${getProviderLabel(currentProvider)} API key`,
                provider: currentProvider,
            });
            setInputState({ cursorPosition: 0, value: "" });
            setMenuState({ kind: "none" });
            return;
        }
        if (option.id === "langsmith-key") {
            if (args && args.length > 0) {
                setError("Use the masked prompt for LangSmith keys; do not pass keys inline.");
                return;
            }
            setError(null);
            setNotice("Paste your LangSmith API key, or press Enter empty to clear.");
            setSecretInputMode({
                envKey: "LANGSMITH_API_KEY",
                kind: "langsmith-key",
                label: "LangSmith API key",
            });
            setInputState({ cursorPosition: 0, value: "" });
            setMenuState({ kind: "none" });
            return;
        }
        if (option.id === "init" || option.id === "update") {
            resetInput();
            onCommandRun(option.id, args);
            return;
        }
        if (option.id === "clear") {
            resetInput();
            onClear();
            setNotice("Started a new chat thread.");
            return;
        }
        if (option.id === "help") {
            resetInput();
            setNotice("Slash commands: /provider, /model, /effort, /api-key, /langsmith-key, /init, /update, /clear, /help, /exit. Use arrows to select.");
            return;
        }
        resetInput();
        onSubmit("/exit");
    }
    async function selectModelMenuOption(selectedIndex) {
        const option = getModelMenuOptions(currentModelId, currentProvider)[selectedIndex];
        if (!option) {
            setError("Select a model.");
            return;
        }
        if (option.kind === "custom") {
            setError(null);
            setNotice("Type a custom model ID after /model.");
            setInputValue("/model ");
            return;
        }
        await saveModelSelection(option.modelId);
    }
    async function selectReasoningEffortMenuOption(selectedIndex) {
        const option = getReasoningEffortMenuOptions(currentProvider, currentModelId)[selectedIndex];
        if (!option) {
            setError("Select a reasoning effort.");
            return;
        }
        await saveReasoningEffortSelection(option.kind === "default" ? "default" : option.effort);
    }
    async function saveModelSelection(rawModelId) {
        const modelId = normalizeModelId(rawModelId);
        if (!isValidModelId(modelId)) {
            setError("Enter a valid model ID.");
            return;
        }
        setIsSaving(true);
        setError(null);
        setNotice(null);
        try {
            await onModelSelect(modelId);
            resetInput();
            setNotice(`Model switched to ${modelId}.`);
        }
        catch (saveError) {
            setError(saveError instanceof Error
                ? saveError.message
                : "Failed to save model selection.");
        }
        finally {
            setIsSaving(false);
        }
    }
    async function saveReasoningEffortSelection(rawEffort) {
        const normalizedEffort = rawEffort.trim().toLowerCase();
        const effort = normalizedEffort === "default" || normalizedEffort === "provider-default"
            ? null
            : isReasoningEffort(normalizedEffort)
                ? normalizedEffort
                : undefined;
        if (effort === undefined) {
            setError("Enter a supported effort value, or use /effort default.");
            return;
        }
        const capability = getReasoningCapability(currentProvider, currentModelId);
        if (!capability) {
            setError(`Reasoning effort is not supported for ${getProviderLabel(currentProvider)} model ${currentModelId}.`);
            return;
        }
        if (effort !== null && !capability.values.includes(effort)) {
            setError(`Unsupported reasoning effort "${effort}". Available values: ${capability.values.join(", ")}.`);
            return;
        }
        setIsSaving(true);
        setError(null);
        setNotice(null);
        try {
            const result = await onReasoningEffortSelect(effort);
            resetInput();
            if (result?.isShadowedByShell) {
                setNotice(`Reasoning effort saved as ${effort ?? "provider default"}, but this session uses the shell value. Unset ${OPENWIKI_REASONING_EFFORT_ENV_KEY} to use the saved setting.`);
            }
            else {
                setNotice(effort === null
                    ? "Reasoning effort reset to provider default."
                    : `Reasoning effort set to ${effort}.`);
            }
        }
        catch (saveError) {
            setError(saveError instanceof Error
                ? saveError.message
                : "Failed to save reasoning effort.");
        }
        finally {
            setIsSaving(false);
        }
    }
    async function selectProviderMenuOption(selectedIndex) {
        const provider = SELECTABLE_OPENWIKI_PROVIDERS[selectedIndex];
        if (!provider) {
            setError("Select a provider.");
            return;
        }
        await saveProviderSelection(provider);
    }
    async function saveProviderSelection(rawProvider) {
        const provider = normalizeProvider(rawProvider);
        if (provider === null) {
            setError(`Enter a valid provider: ${SELECTABLE_OPENWIKI_PROVIDERS.join(", ")}.`);
            return;
        }
        setIsSaving(true);
        setError(null);
        setNotice(null);
        try {
            await onProviderSelect(provider);
            resetInput();
            const apiKeyEnvKey = getProviderApiKeyEnvKey(provider);
            const requirement = providerUsesAwsSdkCredentials(provider)
                ? (getProviderCredentialHint(provider) ??
                    "Configure AWS SDK credentials.")
                : apiKeyEnvKey
                    ? `Ensure ${apiKeyEnvKey} is set.`
                    : `Ensure ${getProviderProjectEnvKey(provider)} is set. ${getProviderCredentialHint(provider) ?? ""}`.trim();
            const modelNotice = getProviderModelOptions(provider).length > 0
                ? ` with model ${getDefaultModelId(provider)}`
                : ". Set a model with /model";
            setNotice(`Provider switched to ${getProviderLabel(provider)}${modelNotice}. ${requirement}`);
        }
        catch (saveError) {
            setError(saveError instanceof Error
                ? saveError.message
                : "Failed to save provider selection.");
        }
        finally {
            setIsSaving(false);
        }
    }
    async function saveSecretInput() {
        if (secretInputMode === null) {
            return;
        }
        const nextValue = input.trim();
        if (secretInputMode.kind === "api-key" && nextValue.length === 0) {
            setError(`${secretInputMode.envKey} is required.`);
            return;
        }
        setIsSaving(true);
        setError(null);
        setNotice(null);
        try {
            if (secretInputMode.kind === "langsmith-key") {
                await saveOpenWikiEnv({
                    LANGCHAIN_PROJECT: nextValue.length > 0 ? "openwiki" : "",
                    LANGCHAIN_TRACING_V2: nextValue.length > 0 ? "true" : "false",
                    LANGSMITH_API_KEY: nextValue,
                });
            }
            else {
                await saveOpenWikiEnv({
                    [secretInputMode.envKey]: nextValue,
                });
            }
            const savedLabel = secretInputMode.label;
            resetInput();
            setSecretInputMode(null);
            setNotice(`${savedLabel} saved.`);
        }
        catch (saveError) {
            setError(saveError instanceof Error
                ? saveError.message
                : "Failed to save credential.");
        }
        finally {
            setIsSaving(false);
        }
    }
    function resetInput() {
        setInputState({ cursorPosition: 0, value: "" });
        setMenuState({ kind: "none" });
        setError(null);
    }
    function setInputValue(value) {
        setInputState({
            cursorPosition: value.length,
            value,
        });
    }
    const beforeCursor = input.slice(0, cursorPosition);
    const afterCursor = input.slice(cursorPosition);
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Box, { borderStyle: "single", borderColor: "blue", paddingX: 1, children: _jsxs(Text, { children: [_jsx(Text, { color: "blue", children: ">" }), " ", secretInputMode !== null ? (_jsxs(_Fragment, { children: [_jsxs(Text, { color: "gray", children: [secretInputMode.envKey, "="] }), _jsx(Text, { color: "yellow", children: formatSecretInputSummary(input) })] })) : input.length > 0 ? (_jsxs(_Fragment, { children: [beforeCursor, _jsx(InputCursor, {}), afterCursor] })) : (_jsxs(_Fragment, { children: [_jsx(InputCursor, {}), _jsx(Text, { color: "gray", children: " Ask a follow-up..." })] }))] }) }), _jsx(Text, { children: _jsx(Text, { color: "gray", children: secretInputMode !== null
                        ? "enter to save - esc to cancel - input is masked"
                        : `enter to send - / for commands - /exit to quit - cwd ${formatCwd(process.cwd())}` }) }), secretInputMode !== null ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: secretInputMode.label }), _jsxs(Text, { children: ["Saving to ", _jsx(Text, { color: "cyan", children: secretInputMode.envKey })] }), secretInputMode.kind === "langsmith-key" ? (_jsx(Text, { color: "gray", children: "Press Enter empty to clear LangSmith." })) : null] })) : menuState.kind !== "none" ? (_jsx(SlashMenu, { currentModelId: currentModelId, currentProvider: currentProvider, currentReasoningEffort: currentReasoningEffort, input: input, menuState: menuState })) : null, notice ? _jsx(Text, { color: "green", children: notice }) : null, isSaving ? _jsx(Text, { color: "gray", children: "Saving selection..." }) : null, error ? _jsx(Text, { color: "red", children: error }) : null] }));
}
/**
 * The slash-command popup: renders the model, provider, or command menu with
 * the current selection highlighted.
 */
export function SlashMenu({ currentModelId, currentProvider, currentReasoningEffort, input, menuState, }) {
    if (menuState.kind === "model") {
        const modelOptions = getModelMenuOptions(currentModelId, currentProvider);
        return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { color: "gray", children: ["Models for ", getProviderLabel(currentProvider)] }), modelOptions.map((option, index) => (_jsx(MenuRow, { description: option.kind === "model" && option.modelId === currentModelId
                        ? "current"
                        : option.kind === "custom"
                            ? "type /model <model-id>"
                            : "", isSelected: index === menuState.selectedIndex, label: option.label }, option.label))), input.startsWith("/model ") ? (_jsx(Text, { color: "gray", children: "Press enter to save the custom model ID." })) : (_jsx(Text, { color: "gray", children: "Use arrows, enter to select, esc to cancel." }))] }));
    }
    if (menuState.kind === "effort") {
        const effortOptions = getReasoningEffortMenuOptions(currentProvider, currentModelId);
        return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { color: "gray", children: ["Reasoning effort for ", getProviderLabel(currentProvider), " ", currentModelId] }), effortOptions.map((option, index) => (_jsx(MenuRow, { description: (option.kind === "default" && currentReasoningEffort === null) ||
                        (option.kind === "effort" &&
                            option.effort === currentReasoningEffort)
                        ? "current"
                        : option.kind === "default"
                            ? "clears the saved setting"
                            : "", isSelected: index === menuState.selectedIndex, label: option.label }, option.label))), input.startsWith("/effort ") ? (_jsx(Text, { color: "gray", children: "Press enter to save a value, or type /effort default." })) : (_jsx(Text, { color: "gray", children: "Use arrows, enter to select, esc to cancel." }))] }));
    }
    if (menuState.kind === "provider") {
        return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: "Providers" }), SELECTABLE_OPENWIKI_PROVIDERS.map((provider, index) => (_jsx(MenuRow, { description: provider === currentProvider
                        ? "current"
                        : `default model ${getDefaultModelId(provider)}`, isSelected: index === menuState.selectedIndex, label: getProviderLabel(provider) }, provider))), _jsx(Text, { color: "gray", children: "Use arrows, enter to select, esc to cancel." })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: "Commands" }), slashCommandOptions.map((option, index) => (_jsx(MenuRow, { description: option.description, isSelected: index === menuState.selectedIndex, label: option.label }, option.id))), _jsx(Text, { color: "gray", children: "Use arrows, enter to select, esc to cancel." })] }));
}
