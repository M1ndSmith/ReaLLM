import type { EvidenceResolver } from "./types.js";
/**
 * Memoizes evidence resolutions for one explicitly scoped processing phase.
 *
 * Callers create a fresh wrapper for preflight, one mutation batch, or one
 * finalization pass so caching never crosses a freshness boundary.
 *
 * @param resolver - Underlying evidence resolver.
 * @returns Resolver that resolves each resource and prior-version pair at most once.
 */
export declare function cacheEvidenceResolver(resolver: EvidenceResolver): EvidenceResolver;
