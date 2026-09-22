import type { Claim, ClaimOperation, EvidenceResolver } from "./types.js";
/**
 * Inputs for one atomic generic claim-set mutation.
 */
export interface ApplyClaimOperationsInput {
    /**
     * Complete current claim set for one brain-owned subject.
     */
    claims: readonly Claim[];
    /**
     * Ordered mutations proposed by an agent or application.
     */
    operations: readonly ClaimOperation[];
    /**
     * Resolver for the evidence namespace accepted by the owning brain.
     */
    resolver: EvidenceResolver;
    /**
     * Identifier factory used for newly added claims.
     *
     * @default a `claim_`-prefixed cryptographically random UUID.
     */
    createClaimId?: () => string;
}
/**
 * Validates, resolves, and applies a mutation batch without partial changes.
 *
 * @param input - Current claims, operations, resolver, and optional ID factory.
 * @returns A structurally independent complete claim set.
 */
export declare function applyClaimOperations(input: ApplyClaimOperationsInput): Promise<Claim[]>;
/**
 * Clones claim state across ownership boundaries.
 *
 * @param claims - Claims to clone.
 * @returns Structurally independent records.
 */
export declare function cloneClaims(claims: readonly Claim[]): Claim[];
