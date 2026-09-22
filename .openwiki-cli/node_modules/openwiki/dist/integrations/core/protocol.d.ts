import { z } from "zod";
/**
 * Lifecycle modes supported by host-authored repository runs.
 */
export type HostRunMode = "init" | "update";
/**
 * The complete 0.5 repository-generation MCP tool set.
 */
export type ProtocolToolName = "openwiki_begin" | "openwiki_submit_plan" | "openwiki_next_page" | "openwiki_inspect_page_claims" | "openwiki_submit_page" | "openwiki_finish";
/**
 * Validated host request to start or resume a repository run.
 */
export interface BeginRequest {
    /**
     * User-supplied path resolved to an absolute Git repository root.
     */
    root: string;
    /**
     * Repository generation command to start or resume.
     */
    mode: HostRunMode;
    /**
     * Optional requested documentation language, as a BCP-47 code (for example
     * `ko`, `zh-CN`, `pt-BR`) rather than an English language name. An
     * unrecognized value fails the call with `invalid_input` and starts no run,
     * so a rejected request leaves nothing to clean up and can simply be retried
     * with a real code. Omit it to keep the wiki's existing language.
     */
    language?: string;
    /**
     * Whether update no-op detection must be bypassed.
     */
    force?: boolean;
}
/**
 * Validated request addressing one active durable run.
 */
export interface RunRequest {
    /**
     * Stable UUID returned by `openwiki_begin` for the active run.
     */
    runId: string;
}
/**
 * Strict MCP schema for `openwiki_begin`.
 */
export declare const BeginInput: z.ZodType<BeginRequest>;
/**
 * Strict run-identity schema shared by next/finish operations.
 */
export declare const RunInput: z.ZodType<RunRequest>;
/**
 * Strict model/host proposal for one final factual page.
 */
export declare const PlanPageInput: z.ZodObject<{
    path: z.ZodString;
    title: z.ZodString;
    purpose: z.ZodString;
    seedPaths: z.ZodOptional<z.ZodArray<z.ZodString>>;
    relatedPages: z.ZodOptional<z.ZodArray<z.ZodString>>;
    instructions: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
/**
 * Strict MCP schema for `openwiki_submit_plan`.
 */
export declare const SubmitPlanInput: z.ZodObject<{
    runId: z.ZodString;
    pages: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        title: z.ZodString;
        purpose: z.ZodString;
        seedPaths: z.ZodOptional<z.ZodArray<z.ZodString>>;
        relatedPages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        instructions: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    deletePages: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
/**
 * Strict MCP schema for `openwiki_next_page`.
 */
export declare const NextPageInput: z.ZodType<RunRequest, unknown, z.core.$ZodTypeInternals<RunRequest, unknown>>;
/**
 * Strict MCP schema for inspecting the current pending page's Claims on demand.
 */
export declare const InspectPageClaimsInput: z.ZodObject<{
    runId: z.ZodString;
    jobId: z.ZodString;
}, z.core.$strict>;
/**
 * Strict proposed material Claim with code-owned version omitted.
 */
export declare const ProposedPageClaimInput: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    statement: z.ZodString;
    evidence: z.ZodArray<z.ZodObject<{
        resource: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
/**
 * Strict MCP schema for `openwiki_submit_page`.
 */
export declare const SubmitPageInput: z.ZodObject<{
    runId: z.ZodString;
    jobId: z.ZodString;
    confirmedClaimIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    claims: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        statement: z.ZodString;
        evidence: z.ZodArray<z.ZodObject<{
            resource: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    retractedClaimIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
/**
 * Validated plan submission payload.
 */
export type SubmitPlanRequest = z.infer<typeof SubmitPlanInput>;
/**
 * Validated next-page request payload.
 */
export type NextPageRequest = z.infer<typeof NextPageInput>;
/** Validated request for the current pending page's complete Claims. */
export type InspectPageClaimsRequest = z.infer<typeof InspectPageClaimsInput>;
/**
 * Validated page completion payload.
 */
export type SubmitPageRequest = z.infer<typeof SubmitPageInput>;
/**
 * Returns whether a host/producer identifier is safe for protocol metadata.
 *
 * @param value - Candidate host or producer identifier.
 * @returns Whether the identifier is canonical and bounded.
 */
export declare function isValidHostId(value: string): boolean;
/**
 * One of the complete five MCP tools exposed by OpenWiki 0.4.
 */
export interface ProtocolTool {
    /**
     * Canonical MCP lifecycle tool name.
     */
    name: ProtocolToolName;
    /**
     * Model-facing description of the lifecycle operation.
     */
    description: string;
    /**
     * Strict runtime schema for the tool input.
     */
    schema: z.ZodType;
    /**
     * Validates and executes one lifecycle operation.
     *
     * @param input - Untrusted transport input.
     * @returns The structured lifecycle result.
     */
    handle(input: unknown): Promise<unknown>;
}
