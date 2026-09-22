import type { Key } from "ink";
import { type OpenWikiProvider } from "../../config/constants.js";
import type { ChatInputMenuState, ModelMenuOption, ReasoningEffortMenuOption, SlashCommandOption } from "./types.js";
/**
 * The slash commands shown in the command menu, in display order.
 */
export declare const slashCommandOptions: SlashCommandOption[];
/**
 * Derives the menu that should be showing for the current input text: the
 * provider menu for `/provider`, the model menu for `/model`, the command menu
 * for any other `/`-prefixed input, or no menu otherwise. Preserves the
 * highlighted index when the same menu kind stays open.
 */
export declare function syncMenuStateForInput(input: string, currentState: ChatInputMenuState, currentModelId: string, currentProvider: OpenWikiProvider, currentReasoningEffort?: string | null): ChatInputMenuState;
/**
 * Moves the highlighted item within the active menu by `offset`, wrapping
 * around the ends. Returns the state unchanged when no menu is open.
 */
export declare function moveMenuSelection(menuState: ChatInputMenuState, offset: number, currentModelId: string, currentProvider: OpenWikiProvider): ChatInputMenuState;
/**
 * Finds the first command whose label the typed input is a prefix of, falling
 * back to the first command when none match.
 */
export declare function getCommandOptionIndex(input: string): number;
/**
 * Finds the model-menu row for the currently selected model, falling back to
 * the first row when the current model is not in the list.
 */
export declare function getCurrentModelOptionIndex(currentModelId: string, currentProvider: OpenWikiProvider): number;
/**
 * Finds the provider-menu row for the current provider, falling back to the
 * first row when it is not selectable.
 */
export declare function getCurrentProviderOptionIndex(currentProvider: OpenWikiProvider): number;
/**
 * Builds the model-menu rows for a provider: the current model plus the
 * provider's preset models (deduped, current first), each labeled with its
 * preset name when known, followed by a "Custom model ID" row.
 */
export declare function getModelMenuOptions(currentModelId: string, currentProvider: OpenWikiProvider): ModelMenuOption[];
/**
 * Builds the capability-gated reasoning-effort rows for a provider and model.
 * Unsupported combinations return no rows, so callers can show an explanation
 * instead of offering a value that would fail before a request is sent.
 */
export declare function getReasoningEffortMenuOptions(provider: OpenWikiProvider, modelId: string): ReasoningEffortMenuOption[];
/** Finds the selected reasoning-effort row, falling back to provider default. */
export declare function getCurrentReasoningEffortOptionIndex(provider: OpenWikiProvider, modelId: string, currentReasoningEffort: string | null): number;
/**
 * Parses a submitted input line into a matching slash command and its trailing
 * arguments, or returns null when the first token is not a known command.
 */
export declare function parseSlashInput(input: string): {
    args: string;
    option: SlashCommandOption;
} | null;
/**
 * Reports whether a keystroke is an up-arrow (menu previous), from either the
 * parsed `key` flag or a raw ANSI up-arrow sequence.
 */
export declare function isMenuUpInput(inputValue: string, key: Key): boolean;
/**
 * Reports whether a keystroke is a down-arrow (menu next), from either the
 * parsed `key` flag or a raw ANSI down-arrow sequence.
 */
export declare function isMenuDownInput(inputValue: string, key: Key): boolean;
/**
 * Clamps a menu index into `[0, itemCount - 1]` (or 0 when the menu is empty).
 */
export declare function clampMenuIndex(index: number, itemCount: number): number;
/**
 * Wraps a menu index into `[0, itemCount - 1]`, cycling past either end.
 */
export declare function wrapMenuIndex(index: number, itemCount: number): number;
