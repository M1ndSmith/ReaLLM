import type { ClaimsVerificationEvent } from "../claims/brains/code/types.js";
/**
 * Minimal generated-page storage required by the verification projector.
 */
export interface ClaimsVerificationPageStore {
    discoverPages(): Promise<string[]>;
    readMarkdown(page: string): Promise<string>;
    writeMarkdown(page: string, content: string): Promise<void>;
}
/**
 * Exact pre-projection Markdown keyed by every page changed by the projector.
 */
export type ClaimsVerificationChanges = ReadonlyMap<string, string>;
/**
 * Reconciles OpenWiki-owned OKF verification events against durable Claims
 * state while retaining human, process, and other producer events.
 *
 * Every grounded concept participates. A page without an active durable event
 * loses only events in the `openwiki/<version>` actor family. Bare verifier
 * mappings are normalized to the canonical list representation when touched.
 *
 * @param store - Contained generated-page storage.
 * @param verificationByPage - Active durable event per Claims page.
 * @returns Original Markdown for changed pages, used for transactional rollback.
 */
export declare function synchronizeClaimsVerification(store: ClaimsVerificationPageStore, verificationByPage: ReadonlyMap<string, ClaimsVerificationEvent | null>): Promise<ClaimsVerificationChanges>;
/**
 * Restores exact Markdown for pages whose sidecar hash refresh failed.
 */
export declare function rollbackClaimsVerification(store: ClaimsVerificationPageStore, originals: ClaimsVerificationChanges, pages: readonly string[]): Promise<void>;
