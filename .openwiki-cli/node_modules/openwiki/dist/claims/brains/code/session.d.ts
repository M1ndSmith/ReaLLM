import type { EvidenceResolver } from "../../core/types.js";
import { ClaimsStore } from "./store.js";
import { type ClaimsFinalizeResult, type ClaimsPageVersionRefreshResult, type ClaimsVerificationEvent, type GroundingIssue, type InspectedClaim, type PageClaims, type ResolveClaimsInput, type ResolveClaimsResult } from "./types.js";
/**
 * Injectable dependencies and persisted state for one Claims session.
 */
export interface ClaimSessionOptions {
    /**
     * Deterministic repository evidence resolver.
     */
    resolver: EvidenceResolver;
    /**
     * Valid persisted page state loaded before the run.
     */
    persisted: Map<string, PageClaims>;
    /**
     * Lazy page-local evidence issues detected during preflight.
     */
    issues: GroundingIssue[];
    /**
     * Sidecars whose generated Markdown pages no longer exist.
     */
    orphanPages: string[];
    /**
     * Identifier factory used for newly added claims.
     *
     * @default A `claim_`-prefixed cryptographically random UUID.
     */
    createClaimId?: () => string;
}
/**
 * Run-scoped claim state with lazy inspection and dirty-only persistence.
 */
export declare class ClaimSession {
    /**
     * Deterministic repository evidence resolver.
     */
    private readonly resolver;
    /**
     * Working page state keyed by canonical virtual path.
     */
    private readonly pages;
    /**
     * Current generated-page owner for every globally unique claim identifier.
     */
    private readonly claimOwners;
    /**
     * Sidecars eligible for deterministic successful-run cleanup.
     */
    private readonly orphanPages;
    /**
     * OpenWiki-owned identifier factory.
     */
    private readonly createClaimId;
    /**
     * Creates a run-scoped Claims session from persisted state and preflight.
     *
     * @param options - Resolver, persisted claims, lazy issues, and orphan pages.
     */
    constructor(options: ClaimSessionOptions);
    /**
     * Atomically validates, resolves, and applies a page-local mutation batch.
     *
     * Successful operations mark only the owning page dirty and clear issues for
     * the claim identifiers they target.
     *
     * @param input - Canonical page and ordered claim operations.
     * @returns Canonical page and compact per-operation results.
     */
    resolveClaims(input: ResolveClaimsInput): Promise<ResolveClaimsResult>;
    /**
     * Returns compact claim state without creating a write obligation.
     *
     * @param pageInput - Virtual generated-page path.
     * @returns Complete cloned model-facing claims without opaque evidence versions.
     */
    inspectClaims(pageInput: string): InspectedClaim[];
    /**
     * Reports whether any current page owns a Claim identifier.
     *
     * This supports idempotent page-level retractions without weakening the
     * cross-page ownership boundary.
     *
     * @param id - Stable Claim identifier.
     * @returns Whether the identifier is currently owned in this session.
     */
    hasClaim(id: string): boolean;
    /**
     * Returns the complete current evidence-resource projection for every page
     * represented in this Claims session.
     *
     * Resources are deduplicated and sorted per page so OKF provenance output is
     * deterministic. Deleted pages are omitted; an empty Claims set remains in
     * the map so a prior code-owned `sources` projection can be removed.
     *
     * @returns Detached page-to-resource state for deterministic finalizers.
     */
    getEvidenceResourcesByPage(): ReadonlyMap<string, readonly string[]>;
    /**
     * Records a successful Markdown deletion so its sidecar follows automatically.
     *
     * @param pageInput - Virtual generated-page path confirmed by the backend.
     */
    recordDeletion(pageInput: string): Promise<void>;
    /**
     * Persists explicitly changed claims and removes deleted or orphaned sidecars.
     *
     * Every dirty page is rechecked against current evidence and its Markdown is
     * hashed before any sidecar is changed. Unrelated claim state remains intact.
     *
     * @param store - OpenWiki-owned Claims persistence.
     */
    finalize(store: ClaimsStore, verification: ClaimsVerificationEvent, excludedPages?: ReadonlySet<string>): Promise<ClaimsFinalizeResult>;
    /**
     * Refreshes persisted page hashes after OKF verification projection.
     *
     * A failed refresh is reported per page so the caller can roll back a newly
     * exposed machine stamp. Debt-driven removals remain removed even when their
     * historical sidecar hash cannot be refreshed.
     *
     * @param store - OpenWiki-owned Claims persistence.
     * @param pages - Pages whose Markdown changed during projection.
     */
    refreshPageVersions(store: ClaimsStore, pages: readonly string[]): Promise<ClaimsPageVersionRefreshResult>;
    /**
     * Verifies that dirty claims still match the evidence accepted this run.
     *
     * @param page - Canonical generated-page path used in diagnostics.
     * @param claims - Complete claims about to be persisted.
     * @param resolver - Finalization-pass cached evidence resolver.
     */
    private assertEvidenceStillCurrent;
    /**
     * Gets or initializes empty working state for a newly claimed page.
     *
     * @param page - Canonical generated-page path.
     * @returns Existing or newly allocated mutable page state.
     */
    private getOrCreatePage;
    /**
     * Allocates an identifier that is unused across every current page.
     *
     * The core mutation layer separately protects against duplicates created
     * within one operation batch. This guard covers identifiers already owned by
     * other generated pages.
     *
     * @returns Globally unused OpenWiki-owned claim identifier.
     */
    private allocateClaimId;
    /**
     * Rejects a page state containing an identifier owned by another page.
     *
     * @param page - Canonical page that would own the supplied claims.
     * @param claims - Proposed complete claim state for that page.
     */
    private assertClaimOwnershipAvailable;
    /**
     * Replaces the global identifier ownership contributed by one page.
     *
     * @param page - Canonical page whose complete state changed.
     * @param previousClaims - Claims owned before the change.
     * @param nextClaims - Claims owned after the change.
     */
    private replaceClaimOwnership;
}
