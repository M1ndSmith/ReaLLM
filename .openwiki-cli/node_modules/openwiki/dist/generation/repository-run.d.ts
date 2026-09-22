import { OpenWikiLocalShellBackend } from "../agent/docs-only-backend.js";
import { OpenWikiIgnore } from "../agent/openwiki-ignore.js";
import type { RunContext } from "../agent/types.js";
import type { UpdateNoopStatus } from "../agent/utils.js";
import { type ClaimsRuntime } from "../claims/brains/code/runtime.js";
import type { GroundingIssue, InspectedClaim, PageClaims } from "../claims/brains/code/types.js";
import { type RepositorySourceCheckpoint } from "./page-manifest.js";
import { type ProposedPageClaimReconciliation, type ProposedRepositoryPlan } from "./page-jobs.js";
import { type PageJob, type RepositoryRunActor, type RepositoryRunMode, type RepositoryRunState } from "./run-state.js";
/**
 * Inputs required to start or resume one repository-generation run.
 */
export interface BeginRepositoryRunInput {
    /**
     * Absolute Git repository root for the run.
     */
    root: string;
    /**
     * Repository generation command to start or resume.
     */
    mode: RepositoryRunMode;
    /**
     * Requested documentation language, resolved before persistence.
     */
    language?: string;
    /**
     * Whether update no-op detection must be bypassed.
     */
    force?: boolean;
    /**
     * Actual user and connector context supplied to planning.
     */
    planningContext?: string;
    /**
     * Producer and metadata identities for the current session.
     */
    actor: RepositoryRunActor;
    /**
     * Optional deterministic clock used by production metadata and tests.
     */
    now?: () => Date;
}
/**
 * Process-local runtime rebuilt from one durable repository checkpoint.
 */
export interface ActiveRepositoryRun {
    /**
     * Absolute Git repository root owned by the run.
     */
    root: string;
    /**
     * Current authoritative state, replaced only after persistence succeeds.
     */
    state: RepositoryRunState;
    /**
     * Repository backend used by code-owned lifecycle operations.
     */
    backend: OpenWikiLocalShellBackend;
    /**
     * Ignore boundary loaded for source and evidence access.
     */
    ignore: OpenWikiIgnore;
    /**
     * Strict process-local Claims runtime rebuilt from durable state.
     */
    claimsRuntime: ClaimsRuntime;
}
/**
 * Pages sharing one committed source baseline and changed-path window.
 */
export interface RepositoryPageUpdateWindow {
    /**
     * Last committed Git HEAD through which these pages are known correct.
     *
     * @default undefined when no trustworthy baseline exists.
     */
    baseGitHead?: string;
    /**
     * Canonical pages that share this baseline.
     */
    pages: string[];
    /**
     * Visible repository paths changed after the shared baseline.
     */
    changedPaths: string[];
    /**
     * Whether the planner must review without a bounded historical baseline.
     */
    fullReview: boolean;
}
/**
 * Page-local durable state captured before a bounded worker starts.
 */
export interface RepositoryPageSnapshot {
    jobId: string;
    path: string;
    markdown: string | null;
    claims: PageClaims | null;
}
/**
 * Host/model-facing view of an active planning or generation run.
 */
export interface ActiveBeginView {
    /**
     * Discriminator for a run that requires planning or generation.
     */
    status: "active";
    /**
     * Stable UUID required by subsequent lifecycle operations.
     */
    runId: string;
    /**
     * Absolute Git repository root owned by the run.
     */
    root: string;
    /**
     * Repository generation command being executed.
     */
    mode: RepositoryRunMode;
    /**
     * Resolved documentation language.
     */
    language: string;
    /**
     * Whether the language differs from the previous successful run.
     */
    languageChanged: boolean;
    /**
     * Current durable lifecycle phase.
     */
    phase: "planning" | "generating";
    /**
     * Whether this view reconstructs an interrupted durable run.
     */
    resumed: boolean;
    /**
     * Successful update metadata that preceded this run, when present.
     */
    lastUpdate: RunContext["lastUpdate"];
    /**
     * Repository-level OpenWiki instructions supplied to planning.
     */
    wikiGoal?: string;
    /**
     * Repository paths changed since the previous successful Git HEAD.
     */
    changedPaths: string[];
    /**
     * Existing factual pages grouped by their committed update baseline.
     */
    pageUpdateWindows: RepositoryPageUpdateWindow[];
    /**
     * Stable Claims preflight issues supplied to planning.
     */
    claimIssues: readonly GroundingIssue[];
    /**
     * Number of durable page jobs already completed.
     */
    completedPages: number;
    /**
     * Total ordered page jobs, absent until a plan is submitted.
     */
    totalPages?: number;
}
/**
 * Clean update result produced only after strict Claims preflight.
 */
export interface NoopBeginView {
    /**
     * Discriminator for a clean update that requires no generation.
     */
    status: "noop";
    /**
     * Absolute Git repository root checked by preflight.
     */
    root: string;
    /**
     * Fixed mode for no-op lifecycle results.
     */
    mode: "update";
    /**
     * Resolved documentation language used by no-op detection.
     */
    language: string;
    /**
     * Complete successful no-op preflight result.
     */
    updatePreflight: Extract<UpdateNoopStatus, {
        shouldSkip: true;
    }>;
}
/**
 * Result of beginning/resuming a run or proving a clean update no-op.
 */
export type BeginRepositoryRunResult = {
    view: ActiveBeginView;
    run: ActiveRepositoryRun;
} | {
    view: NoopBeginView;
};
/**
 * Projects the active run's immutable source identity into page coverage.
 *
 * @param state - Durable active repository run state.
 * @returns Source checkpoint shared by every page in the current plan.
 */
export declare function getRepositoryRunSourceCheckpoint(state: RepositoryRunState): RepositorySourceCheckpoint;
/**
 * Starts a fresh durable run or reconstructs an interrupted run.
 *
 * Fresh init releases its rollback backup only after run state and interrupted
 * metadata are durable. Resume invalidates the whole plan on source drift.
 *
 * @param input - Repository, mode, context, actor, and optional test clock.
 * @returns Active resumable state or a strictly proven update no-op.
 */
export declare function beginRepositoryRun(input: BeginRepositoryRunInput): Promise<BeginRepositoryRunResult>;
/**
 * Validates and durably installs the ordered PageJob queue.
 *
 * @param run - Active planning or generation run.
 * @param input - Complete proposed repository plan.
 * @returns Accepted queue size.
 */
export declare function submitRepositoryPlan(run: ActiveRepositoryRun, input: ProposedRepositoryPlan): Promise<{
    status: "accepted";
    totalPages: number;
}>;
/**
 * First pending job with current page context, or queue completion.
 */
export type NextRepositoryPageResult = {
    status: "pending";
    job: PageJob & {
        mode: RepositoryRunMode;
        existing: boolean;
        existingClaimCount: number;
        claimsRequiringAttention: InspectedClaim[];
    };
} | {
    status: "complete";
};
/**
 * Returns the first pending job without reserving or mutating it.
 *
 * @param run - Active run with a durably installed plan.
 * @returns Current pending job context or queue completion.
 */
export declare function nextRepositoryPage(run: ActiveRepositoryRun): Promise<NextRepositoryPageResult>;
/**
 * Returns the complete compact Claim set for the current pending page on demand.
 *
 * Normal focused updates do not need this payload: current issue-free Claims
 * are retained deterministically. Workers use this only when they intentionally
 * revise or remove otherwise-current page content and need the owning Claim ids.
 *
 * @param run - Active run with a durably installed plan.
 * @param jobId - Current pending page job identifier.
 * @returns Complete model-facing Claims without opaque evidence versions.
 */
export declare function inspectRepositoryPageClaims(run: ActiveRepositoryRun, jobId: string): {
    page: string;
    claims: InspectedClaim[];
};
/**
 * Captures the current pending page and Claims sidecar before model-owned work.
 */
export declare function captureRepositoryPageSnapshot(run: ActiveRepositoryRun, jobId: string): Promise<RepositoryPageSnapshot>;
/**
 * Rolls a failed page worker back without advancing its pending checkpoint.
 */
export declare function skipRepositoryPage(run: ActiveRepositoryRun, snapshot: RepositoryPageSnapshot): Promise<void>;
/**
 * Persists and proves one page's Claims before completing its current job.
 *
 * The in-memory checkpoint changes only after the complete next state is durable.
 *
 * @param run - Active generation run owning the ordered queue.
 * @param input - Current job identifier and complete page Claim set.
 * @returns Completed page and remaining queue length.
 */
export declare function submitRepositoryPage(run: ActiveRepositoryRun, input: {
    jobId: string;
} & ProposedPageClaimReconciliation): Promise<{
    status: "complete";
    page: string;
    remaining: number;
}>;
/**
 * Deterministically finalizes a complete run and records any source drift.
 *
 * `.run.json` is removed last; every earlier failure leaves the run resumable.
 *
 * @param run - Active run whose ordered page queue is complete.
 * @returns Successful completion result after all durable gates pass.
 */
export declare function finishRepositoryRun(run: ActiveRepositoryRun, options?: {
    skippedPageSnapshots?: readonly RepositoryPageSnapshot[];
}): Promise<{
    status: "complete";
    sourceChanged?: true;
}>;
