import { z } from "zod";
const HOST_ID_PATTERN = /^[a-z0-9-]{1,64}$/u;
const CanonicalString = z.string().trim().min(1);
/**
 * Strict MCP schema for `openwiki_begin`.
 */
export const BeginInput = z
    .object({
    root: CanonicalString,
    mode: z.enum(["init", "update"]),
    language: CanonicalString.describe('BCP-47 code, e.g. "ko" (not "Korean").').optional(),
    force: z.boolean().optional(),
})
    .strict();
/**
 * Strict run-identity schema shared by next/finish operations.
 */
export const RunInput = z
    .object({
    runId: z.string().uuid(),
})
    .strict();
/**
 * Strict model/host proposal for one final factual page.
 */
export const PlanPageInput = z
    .object({
    path: CanonicalString,
    title: CanonicalString,
    purpose: CanonicalString,
    seedPaths: z.array(CanonicalString).optional(),
    relatedPages: z.array(CanonicalString).optional(),
    instructions: z.array(CanonicalString).optional(),
})
    .strict();
/**
 * Strict MCP schema for `openwiki_submit_plan`.
 */
export const SubmitPlanInput = z
    .object({
    runId: z.string().uuid(),
    // Empty is valid for an update that has no documentation page work or only
    // planned deletions. Init validation still requires quickstart downstream.
    pages: z.array(PlanPageInput),
    deletePages: z.array(CanonicalString).optional(),
})
    .strict();
/**
 * Strict MCP schema for `openwiki_next_page`.
 */
export const NextPageInput = RunInput;
/**
 * Strict MCP schema for inspecting the current pending page's Claims on demand.
 */
export const InspectPageClaimsInput = z
    .object({
    runId: z.string().uuid(),
    jobId: z.string().uuid(),
})
    .strict();
/**
 * Strict proposed material Claim with code-owned version omitted.
 */
export const ProposedPageClaimInput = z
    .object({
    id: CanonicalString.optional(),
    statement: CanonicalString,
    evidence: z.array(z.object({ resource: CanonicalString }).strict()).min(1),
})
    .strict();
/**
 * Strict MCP schema for `openwiki_submit_page`.
 */
export const SubmitPageInput = z
    .object({
    runId: z.string().uuid(),
    jobId: z.string().uuid(),
    confirmedClaimIds: z.array(CanonicalString).optional(),
    claims: z.array(ProposedPageClaimInput).optional(),
    retractedClaimIds: z.array(CanonicalString).optional(),
})
    .strict();
/**
 * Returns whether a host/producer identifier is safe for protocol metadata.
 *
 * @param value - Candidate host or producer identifier.
 * @returns Whether the identifier is canonical and bounded.
 */
export function isValidHostId(value) {
    return HOST_ID_PATTERN.test(value);
}
