import type { PersistedPreparedWikiState } from "../agent/wiki-finalizer.js";
import type { UpdateMetadata } from "../agent/types.js";
/**
 * Basename of the one durable repository-generation checkpoint.
 */
export declare const REPOSITORY_RUN_STATE_BASENAME = ".run.json";
/**
 * Current on-disk repository-run schema version.
 */
export declare const REPOSITORY_RUN_STATE_SCHEMA_VERSION: 1;
/**
 * Repository generation commands supported by the durable lifecycle.
 */
export type RepositoryRunMode = "init" | "update";
/**
 * Persisted high-level lifecycle phase.
 */
export type RepositoryRunPhase = "planning" | "generating";
/**
 * Persisted completion state for one ordered page job.
 */
export type PageJobStatus = "pending" | "skipped" | "complete";
/**
 * Current producer and metadata identities for repository generation.
 */
export interface RepositoryRunActor {
    /**
     * Provenance actor used for page work performed by the current session.
     */
    producerActor: string;
    /**
     * Model/host identity written to `.last-update.json`.
     */
    metadataModel: string;
}
/**
 * One normalized unit of sequential semantic page work.
 */
export interface PageJob {
    /**
     * Stable identifier used by `submit_page`.
     */
    id: string;
    /**
     * Canonical virtual Markdown path below `/openwiki/`.
     */
    path: string;
    /**
     * Human-readable page title supplied by the normalized plan.
     */
    title: string;
    /**
     * Page-specific documentation objective supplied to its worker.
     */
    purpose: string;
    /**
     * Repository-relative starting points, not research boundaries.
     */
    seedPaths: string[];
    /**
     * Canonical generated pages relevant to this job.
     */
    relatedPages: string[];
    /**
     * Relevant global planning constraints propagated to this page.
     */
    instructions: string[];
    /**
     * Durable completion state for this queue entry.
     */
    status: PageJobStatus;
    /**
     * Producer that durably completed this page.
     *
     * @default undefined for pending/skipped jobs and legacy completed state.
     */
    completedBy?: string;
}
/**
 * Complete normalized plan persisted as the run's ordered queue.
 */
export interface RepositoryRunPlan {
    /**
     * Complete ordered queue of normalized page jobs.
     */
    pages: PageJob[];
    /**
     * Existing pages explicitly selected for deletion by an update.
     */
    deletePages: string[];
}
/**
 * Complete JSON checkpoint required to resume repository generation.
 */
export interface RepositoryRunState {
    /**
     * On-disk schema discriminator for this checkpoint.
     */
    schemaVersion: 1;
    /**
     * Stable UUID used to address this resumable run.
     */
    runId: string;
    /**
     * Repository generation command that created the run.
     */
    mode: RepositoryRunMode;
    /**
     * Current persisted lifecycle phase.
     */
    phase: RepositoryRunPhase;
    /**
     * ISO timestamp captured when the run first began.
     */
    startedAt: string;
    /**
     * Resolved documentation language for the run.
     */
    language: string;
    /**
     * Whether the resolved language differs from the previous successful run.
     */
    languageChanged: boolean;
    /**
     * Existing pages that must be rewritten after a language change.
     */
    requiredRewritePages: string[];
    /**
     * Factual pages present before this run began semantic generation.
     */
    initialPages: string[];
    /**
     * SHA-256 identity of the source input for the active plan.
     */
    sourceFingerprint: string;
    /**
     * Git HEAD paired with `sourceFingerprint` for the active semantic plan.
     *
     * @default undefined for an unborn repository.
     */
    targetGitHead?: string;
    /**
     * Actual user/connector context needed for planning and replanning.
     */
    planningContext?: string;
    /**
     * Current producer and metadata identities, refreshed on resume.
     */
    actor: RepositoryRunActor;
    /**
     * Successful metadata that existed before this run marked itself interrupted.
     */
    previousLastUpdate: UpdateMetadata | null;
    /**
     * Git HEAD recorded by the prior successful repository update.
     */
    baseGitHead?: string;
    /**
     * Repository-level OpenWiki instructions loaded when the run began.
     */
    wikiGoal?: string;
    /**
     * Pre-run OpenWiki content snapshot used for final change detection.
     */
    beforeContentSnapshot: string;
    /**
     * Serialized preparation state required for deterministic finalization.
     */
    preparedWiki: PersistedPreparedWikiState;
    /**
     * Active normalized plan, absent while planning or after invalidation.
     */
    plan?: RepositoryRunPlan;
}
/**
 * Resolves the checkpoint path below an absolute repository root.
 */
export declare function repositoryRunStatePath(root: string): string;
/**
 * Loads and validates resumable state.
 *
 * @returns Valid state, or `null` when no checkpoint exists.
 * @throws RepositoryRunError when the checkpoint is malformed.
 */
export declare function readRepositoryRunState(root: string): Promise<RepositoryRunState | null>;
/**
 * Atomically replaces the complete repository-generation checkpoint.
 *
 * @throws Error when validation or filesystem persistence fails.
 */
export declare function writeRepositoryRunState(root: string, state: RepositoryRunState): Promise<void>;
/**
 * Idempotently removes the checkpoint after completion or init rollback.
 */
export declare function removeRepositoryRunState(root: string): Promise<void>;
