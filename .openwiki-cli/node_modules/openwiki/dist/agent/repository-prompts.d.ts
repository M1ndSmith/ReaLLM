import type { InspectedClaim } from "../claims/brains/code/types.js";
import type { ActiveBeginView } from "../generation/repository-run.js";
import type { PageJob } from "../generation/run-state.js";
/**
 * Builds the bounded planner prompt from the complete active run context.
 *
 * @param view - Durable begin/resume context projected for planning.
 * @param planningContext - Actual user and connector context for this run.
 * @returns Complete planner system prompt.
 */
export declare function createRepositoryPlannerPrompt(view: ActiveBeginView, planningContext?: string): string;
/**
 * Complete page-worker context returned by the durable queue.
 */
export type RepositoryPageWorkerJob = PageJob & {
    /**
     * Repository generation command that owns this job.
     */
    mode: "init" | "update";
    /**
     * Whether the assigned Markdown page already exists.
     */
    existing: boolean;
    /** Number of persisted Claims currently owned by the assigned page. */
    existingClaimCount: number;
    /** Stale or unresolved Claims that require an explicit worker decision. */
    claimsRequiringAttention: InspectedClaim[];
};
/**
 * Builds the prompt for one fresh worker owning exactly one page job.
 *
 * @param job - Assigned page and its compact required Claim context.
 * @param allPages - Complete ordered page queue for quickstart navigation.
 * @param language - Resolved output language for generated prose.
 * @returns Complete page-worker system prompt.
 */
export declare function createRepositoryPagePrompt(job: RepositoryPageWorkerJob, allPages: readonly PageJob[], language: string): string;
