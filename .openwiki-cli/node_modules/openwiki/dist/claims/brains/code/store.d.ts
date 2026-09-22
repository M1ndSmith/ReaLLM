import { type PageClaims } from "./types.js";
/**
 * OpenWiki-owned claim persistence rooted in one repository.
 */
export declare class ClaimsStore {
    /**
     * Absolute repository root.
     */
    private readonly rootDir;
    /**
     * Lazily resolved physical repository root.
     *
     * @default undefined until the first filesystem operation.
     */
    private realRootDirPromise?;
    /**
     * Absolute generated-wiki root.
     */
    private readonly wikiDir;
    /**
     * Absolute sidecar root.
     */
    private readonly claimsDir;
    constructor(rootDir: string);
    /**
     * Discovers generated Markdown pages that own factual claim state.
     *
     * @returns Stable-order virtual page paths.
     */
    discoverPages(): Promise<string[]>;
    /**
     * Discovers persisted sidecars, including orphans.
     *
     * @returns Stable-order virtual page paths represented by sidecars.
     */
    discoverSidecarPages(): Promise<string[]>;
    /**
     * Loads and validates one page sidecar.
     *
     * @param page - Virtual generated-page path.
     * @returns Valid persisted state, or `null` when no sidecar exists.
     */
    loadPage(page: string): Promise<PageClaims | null>;
    /**
     * Loads sidecars for generated pages without creating missing state.
     *
     * @param pages - Virtual generated-page paths.
     * @returns Page-to-sidecar map containing only existing sidecars.
     */
    loadPages(pages: readonly string[]): Promise<Map<string, PageClaims>>;
    /**
     * Hashes the current generated Markdown for synchronization checks.
     *
     * @param page - Virtual generated-page path.
     * @returns Algorithm-prefixed page version.
     */
    hashPage(page: string): Promise<string>;
    /**
     * Reads one generated Markdown page through the Claims path-containment gate.
     *
     * @param page - Virtual generated-page path.
     * @returns Exact UTF-8 Markdown bytes as text.
     */
    readMarkdown(page: string): Promise<string>;
    /**
     * Writes one existing generated Markdown page after resolving it through the
     * Claims path-containment gate. Writing the resolved regular file directly
     * preserves its permissions and prevents path aliases from redirecting the
     * projection outside the repository.
     *
     * @param page - Virtual generated-page path.
     * @param content - Complete replacement Markdown.
     */
    writeMarkdown(page: string, content: string): Promise<void>;
    /**
     * Atomically persists one synchronized page sidecar.
     *
     * @param page - Virtual generated-page path.
     * @param pageClaims - Complete synchronized page state.
     */
    writePage(page: string, pageClaims: PageClaims): Promise<void>;
    /**
     * Deletes one page sidecar after successful page deletion or orphan cleanup.
     *
     * @param page - Virtual page represented by the sidecar.
     */
    deletePage(page: string): Promise<void>;
    /**
     * Resolves a page's absolute sidecar path.
     *
     * @param page - Virtual generated-page path.
     * @returns Absolute contained sidecar path.
     */
    private sidecarPath;
    /**
     * Converts an absolute repository path into diagnostic form.
     *
     * @param absolutePath - Absolute contained filesystem path.
     * @returns Repository-relative POSIX path.
     */
    private displayPath;
    /**
     * Resolves an existing contained regular file without following aliases.
     *
     * @param absolutePath - Expected lexical path below the repository root.
     * @returns Canonical physical path, or `null` when absent.
     */
    private resolveExistingRegularFile;
    /**
     * Resolves an existing contained directory without following aliases.
     *
     * @param absolutePath - Expected lexical path below the repository root.
     * @returns Canonical physical path, or `null` when absent.
     */
    private resolveExistingDirectory;
    /**
     * Creates a contained directory after validating every existing ancestor.
     *
     * @param absolutePath - Expected lexical directory below the repository root.
     * @returns Canonical physical directory path.
     */
    private ensureContainedDirectory;
    /**
     * Resolves a path physically and verifies its canonical repository location.
     *
     * @param absolutePath - Existing lexical path below the repository root.
     * @returns Canonical physical path.
     */
    private resolvePhysicalPath;
    /**
     * Resolves and caches the physical repository root.
     *
     * @returns Canonical repository root path.
     */
    private getRealRootDir;
}
