import React from "react";
import type { OpenWikiCommand } from "../../agent/types.js";
import { type OpenWikiProvider } from "../../config/constants.js";
import { type ReasoningEffort } from "../../config/reasoning.js";
import type { ChatInputMenuState } from "../input/types.js";
import type { CompletedRun } from "./types.js";
/**
 * The scrollback of completed runs: each run's prompt, status line, and log.
 */
export declare function ChatHistory({ runs }: {
    runs: CompletedRun[];
}): React.JSX.Element | null;
/**
 * Props for the interactive chat prompt.
 */
interface ChatInputProps {
    currentModelId: string;
    currentProvider: OpenWikiProvider;
    currentReasoningEffort: string | null;
    onClear: () => void;
    onCommandRun: (command: Extract<OpenWikiCommand, "init" | "update">, message: string | null) => void;
    onModelSelect: (modelId: string) => Promise<void>;
    onProviderSelect: (provider: OpenWikiProvider) => Promise<void>;
    onReasoningEffortSelect: (effort: ReasoningEffort | null) => Promise<ReasoningEffortSelectionResult | void>;
    onSubmit: (message: string) => void;
}
/**
 * The effective result of changing the saved reasoning-effort preference.
 * A shell export intentionally takes precedence over the saved config, so the
 * interactive UI must explain when a saved choice will apply only in a future
 * shell where that export is absent.
 */
export type ReasoningEffortSelectionResult = {
    isShadowedByShell: boolean;
};
/**
 * The interactive follow-up prompt: handles keystrokes, the slash-command menu,
 * and masked credential entry. Secret values are never echoed; only a masked
 * length summary is shown, and keys are persisted via saveOpenWikiEnv.
 */
export declare function ChatInput({ currentModelId, currentProvider, currentReasoningEffort, onClear, onCommandRun, onModelSelect, onProviderSelect, onReasoningEffortSelect, onSubmit, }: ChatInputProps): React.JSX.Element;
/**
 * The slash-command popup: renders the model, provider, or command menu with
 * the current selection highlighted.
 */
export declare function SlashMenu({ currentModelId, currentProvider, currentReasoningEffort, input, menuState, }: {
    currentModelId: string;
    currentProvider: OpenWikiProvider;
    currentReasoningEffort: string | null;
    input: string;
    menuState: Exclude<ChatInputMenuState, {
        kind: "none";
    }>;
}): React.JSX.Element;
export {};
