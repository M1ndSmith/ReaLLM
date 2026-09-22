import type { ClaimSession } from "../claims/brains/code/session.js";
import type { GroundingIssue } from "../claims/brains/code/types.js";
import type { RepositoryRunMode, RepositoryRunPlan } from "./run-state.js";
/**
 * Model/host proposal for one final generated Markdown page.
 */
export interface ProposedPlanPage {
    /**
     * Canonical or normalizable virtual Markdown path below `/openwiki/`.
     */
    path: string;
    /**
     * Human-readable title for the generated page.
     */
    title: string;
    /**
     * Page-specific documentation objective.
     */
    purpose: string;
    /**
     * Repository-relative starting points for page research.
     */
    seedPaths?: string[];
    /**
     * Generated pages whose context is relevant to this job.
     */
    relatedPages?: string[];
    /**
     * Relevant global constraints that the page worker must follow.
     */
    instructions?: string[];
}
/**
 * One proposed material proposition with code-owned evidence versions omitted.
 */
export interface ProposedPageClaim {
    /**
     * Stable Claim identifier, generated when the proposal omits it.
     */
    id?: string;
    /**
     * Material factual proposition asserted by the completed page.
     */
    statement: string;
    /**
     * Complete evidence-resource set supporting the proposition.
     */
    evidence: Array<{
        /**
         * Canonical repository evidence resource resolved by Claims.
         */
        resource: string;
    }>;
}
/**
 * Sparse model/host reconciliation for one completed factual page.
 *
 * Existing issue-free Claims omitted from every field are confirmed
 * deterministically. Claims with a stale or unresolved issue must be named by
 * one of the explicit fields so required grounding work cannot be skipped.
 */
export interface ProposedPageClaimReconciliation {
    /** Existing Claims explicitly rechecked and retained without content edits. */
    confirmedClaimIds?: string[];
    /** Revised existing Claims (with id) and genuinely new Claims (without id). */
    claims?: ProposedPageClaim[];
    /** Existing Claims explicitly removed from the completed page. */
    retractedClaimIds?: string[];
}
/**
 * Complete planner submission before normalization and required-job insertion.
 */
export interface ProposedRepositoryPlan {
    /**
     * Proposed ordered page queue before validation and augmentation.
     */
    pages: ProposedPlanPage[];
    /**
     * Existing generated pages explicitly selected for deletion.
     */
    deletePages?: string[];
}
/**
 * Validates and deterministically normalizes the persisted ordered page queue.
 *
 * @param mode - Repository lifecycle mode owning the proposed plan.
 * @param proposed - Complete proposed page and deletion set.
 * @param claimIssues - Stable preflight issues that require page work.
 * @param requiredRewritePages - Existing pages requiring language rewrites.
 * @returns Complete normalized plan ready for durable persistence.
 * @throws RepositoryRunError when paths, deletion intent, or init shape is invalid.
 */
export declare function createRepositoryPlan(mode: RepositoryRunMode, proposed: ProposedRepositoryPlan, claimIssues: readonly GroundingIssue[], requiredRewritePages?: readonly string[]): RepositoryRunPlan;
/**
 * Reconciles one page's sparse Claim decisions into complete session operations.
 *
 * Existing issue-free Claims omitted from the payload are confirmed without
 * requiring the model to repeat their statements or evidence. Claims carrying
 * a grounding issue require an explicit confirm, update, or retract decision.
 *
 * @param session - Active process-local Claims session.
 * @param pageInput - Page owning the proposed Claim reconciliation.
 * @param proposedInput - Sparse explicit Claim decisions for the page.
 */
export declare function reconcilePageClaims(session: ClaimSession, pageInput: string, proposedInput: ProposedPageClaimReconciliation): Promise<void>;
