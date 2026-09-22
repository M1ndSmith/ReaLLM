/**
 * Memoizes evidence resolutions for one explicitly scoped processing phase.
 *
 * Callers create a fresh wrapper for preflight, one mutation batch, or one
 * finalization pass so caching never crosses a freshness boundary.
 *
 * @param resolver - Underlying evidence resolver.
 * @returns Resolver that resolves each resource and prior-version pair at most once.
 */
export function cacheEvidenceResolver(resolver) {
    const cache = new Map();
    return {
        resolve(resource, previousVersion) {
            const key = JSON.stringify([resource, previousVersion]);
            const cached = cache.get(key);
            if (cached)
                return cached;
            const pending = resolver.resolve(resource, previousVersion);
            cache.set(key, pending);
            return pending;
        },
    };
}
