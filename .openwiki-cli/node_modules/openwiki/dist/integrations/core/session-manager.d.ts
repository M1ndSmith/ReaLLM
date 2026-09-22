import { type BeginRequest, type InspectPageClaimsRequest, type NextPageRequest, type ProtocolTool, type RunRequest, type SubmitPageRequest, type SubmitPlanRequest } from "./protocol.js";
/**
 * Stable host identity and optional deterministic clock for the MCP adapter.
 */
export interface HostSessionManagerOptions {
    /**
     * Stable lowercase host identity used in protocol metadata.
     */
    host: string;
    /**
     * Provenance actor, defaulting to the host identity when omitted.
     */
    producerActor?: string;
    /**
     * Optional deterministic clock used by production metadata and tests.
     */
    now?: () => Date;
}
/**
 * Thin single-run MCP adapter over the transport-neutral lifecycle core.
 */
export declare class HostSessionManager {
    /**
     * Current process-local runtime for the active durable run.
     */
    private active;
    /**
     * Whether one lifecycle operation currently owns this adapter.
     */
    private operationInProgress;
    /**
     * Validated host identity recorded in run metadata.
     */
    private readonly host;
    /**
     * Validated producer identity recorded in generated provenance.
     */
    private readonly producerActor;
    /**
     * Clock forwarded to the repository lifecycle core.
     */
    private readonly now;
    /**
     * Stores validated host identity and clock dependencies for one adapter.
     *
     * @param host - Validated host identity.
     * @param producerActor - Validated generated-content producer identity.
     * @param now - Clock used by repository lifecycle operations.
     */
    private constructor();
    /**
     * Validates host identity and creates an empty single-run adapter.
     *
     * @param options - Host identity, optional producer, and optional clock.
     * @returns A validated rootless session manager.
     */
    static create(options: HostSessionManagerOptions): HostSessionManager;
    /**
     * Starts or resumes the addressed repository run.
     *
     * @param input - Validated repository and generation mode.
     * @returns Active run context or a proven update no-op.
     */
    begin(input: BeginRequest): Promise<unknown>;
    /**
     * Validates and persists the active run's canonical plan.
     *
     * @param input - Run identity and complete proposed plan.
     * @returns The accepted queue size.
     */
    submitPlan(input: SubmitPlanRequest): Promise<unknown>;
    /**
     * Returns the active run's first pending page job.
     *
     * @param input - Exact active run identity.
     * @returns Current pending page context or queue completion.
     */
    nextPage(input: NextPageRequest): Promise<unknown>;
    /** Returns the current pending page's complete Claims only when requested. */
    inspectPageClaims(input: InspectPageClaimsRequest): Promise<unknown>;
    /**
     * Submits sparse Claim decisions for the active page job.
     *
     * @param input - Active job identity and sparse Claim decisions.
     * @returns Completed page and remaining queue size.
     */
    submitPage(input: SubmitPageRequest): Promise<unknown>;
    /**
     * Strictly finalizes the active run and clears process-local state.
     *
     * @param input - Exact active run identity.
     * @returns Successful durable completion result.
     */
    finish(input: RunRequest): Promise<unknown>;
    /**
     * Returns exactly the six OpenWiki 0.5 lifecycle tools.
     *
     * @returns Ordered transport-neutral tool definitions.
     */
    tools(): readonly ProtocolTool[];
    /**
     * Returns the process-local run only when the durable run ID matches.
     *
     * @param runId - Run identity supplied by the host operation.
     * @returns Matching process-local repository runtime.
     */
    private requireSession;
    /**
     * Serializes one adapter operation and maps lifecycle errors at its boundary.
     *
     * @param task - Lifecycle operation that requires exclusive adapter access.
     * @returns The operation result.
     */
    private runOperation;
    /**
     * Acquires the adapter's single-operation guard or rejects concurrent work.
     */
    private startOperation;
}
