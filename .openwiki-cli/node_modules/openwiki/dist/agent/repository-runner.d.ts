import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { RepositoryRunMode } from "../generation/run-state.js";
import type { OpenWikiRunEvent } from "./types.js";
/**
 * Inputs for one native repository-generation command.
 */
export interface NativeRepositoryGenerationOptions {
    /**
     * Absolute Git repository root owned by the run.
     */
    root: string;
    /**
     * Repository generation command to execute or resume.
     */
    mode: RepositoryRunMode;
    /**
     * Requested output language, resolved by the durable lifecycle.
     */
    language?: string | null;
    /**
     * Whether strict update no-op detection must be bypassed.
     */
    force?: boolean;
    /**
     * Actual user and connector context supplied to planning.
     */
    planningContext?: string | null;
    /**
     * Stable model identity written to repository run metadata.
     */
    modelId: string;
    /**
     * Initialized chat model reused by fresh planner and page workers.
     */
    model: BaseChatModel;
    /**
     * Optional lifecycle and bounded worker-tool event consumer.
     */
    onEvent?: (event: OpenWikiRunEvent) => void;
}
/**
 * Observable result of one native repository-generation command.
 */
export interface NativeRepositoryGenerationResult {
    /**
     * Whether strict preflight proved that an update required no generation.
     */
    skipped: boolean;
    /**
     * Whether the repository changed after planning, leaving a later update due.
     */
    sourceChanged?: true;
}
/**
 * Drives the shared lifecycle with one planner and one fresh agent per page.
 *
 * The supplied model is reused, but no repository-generation checkpointer or
 * worker state survives beyond the durable core.
 *
 * @param options - Repository, model, planning context, and event consumer.
 * @returns No-op status and whether a later update remains due to source drift.
 */
export declare function runNativeRepositoryGeneration(options: NativeRepositoryGenerationOptions): Promise<NativeRepositoryGenerationResult>;
/**
 * Normalizes a DeepAgents tools-stream chunk from an approved worker tool.
 *
 * @param chunk - Unknown streamed graph chunk.
 * @returns Bounded tool lifecycle event or `null` for narration/unknown tools.
 */
export declare function parseWorkerToolEvent(chunk: unknown): OpenWikiRunEvent | null;
