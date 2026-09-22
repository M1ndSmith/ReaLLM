/**
 * OpenWiki-owned claims directory relative to the wiki root.
 */
export declare const CLAIMS_DIRECTORY = ".claims";
/**
 * Markdown basenames excluded from factual claim persistence.
 */
export declare const RESERVED_WIKI_FILES: ReadonlySet<string>;
/**
 * Canonicalizes a virtual generated-page path.
 *
 * @param page - Agent-supplied page path.
 * @returns Canonical `/openwiki/...md` path.
 */
export declare function normalizeWikiPagePath(page: string): string;
/**
 * Canonicalizes a model-supplied page with an optional wiki-root prefix.
 *
 * @param page - Agent-supplied canonical, repository-relative, or wiki-relative path.
 * @returns Canonical `/openwiki/...md` path for internal Claims APIs.
 */
export declare function normalizeClaimsToolPagePath(page: string): string;
/**
 * Canonicalizes a model-supplied generated Markdown path.
 *
 * Unlike {@link normalizeClaimsToolPagePath}, this permits structural generated
 * pages that do not own Claims. Claims implementation files remain unavailable.
 *
 * @param page - Agent-supplied canonical, repository-relative, or wiki-relative path.
 * @returns Canonical `/openwiki/...md` path for a generated Markdown file.
 */
export declare function normalizeWikiToolPagePath(page: string): string;
/**
 * Determines whether a virtual Markdown path owns code-brain claim state.
 *
 * @param page - Canonical or candidate virtual page path.
 * @returns Whether the page receives a `.claims` sidecar.
 */
export declare function isGroundedWikiPage(page: string): boolean;
/**
 * Converts a virtual generated-page path into its repository-relative path.
 *
 * @param page - Canonical virtual page path.
 * @returns Repository-relative POSIX path beginning with `openwiki/`.
 */
export declare function toRepositoryPagePath(page: string): string;
/**
 * Converts a virtual generated-page path into its sidecar-relative path.
 *
 * @param page - Canonical virtual page path.
 * @returns Path relative to `openwiki/.claims` with a `.json` extension.
 */
export declare function toClaimsSidecarRelativePath(page: string): string;
