import type { OpenWikiIgnore } from "./openwiki-ignore.js";
import { CODE_SYSTEM_PROMPTS, CODE_USER_PROMPTS } from "./prompts/code.js";
import { PERSONAL_SYSTEM_PROMPTS, PERSONAL_USER_PROMPTS } from "./prompts/personal.js";
import type { OpenWikiCommand, OpenWikiOutputMode, RunContext } from "./types.js";
export { CODE_SYSTEM_PROMPTS, CODE_USER_PROMPTS, PERSONAL_SYSTEM_PROMPTS, PERSONAL_USER_PROMPTS, };
export declare function createSystemPrompt(command: OpenWikiCommand, outputMode?: OpenWikiOutputMode, language?: string, openWikiIgnore?: OpenWikiIgnore): string;
/**
 * Builds the command-specific user prompt.
 *
 * @param command - Current OpenWiki command.
 * @param context - Persisted run context.
 * @param userMessage - Optional user instruction.
 * @param outputMode - Current output target.
 * @param runtimeRoot - Optional host runtime root.
 * @returns Fully substituted user prompt.
 */
export declare function createUserPrompt(command: OpenWikiCommand, context: RunContext, userMessage?: string | null, outputMode?: OpenWikiOutputMode, runtimeRoot?: string): string;
export declare function formatRuntimeRootInstruction(outputMode: OpenWikiOutputMode): string;
export declare function createLinkIntegrityInstructions(): string;
export declare function createDiagramInstructions(): string;
