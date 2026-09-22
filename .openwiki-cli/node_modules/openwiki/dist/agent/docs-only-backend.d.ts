import { LocalShellBackend, type DeleteResult, type EditResult, type ExecuteResponse, type FileDownloadResponse, type FileUploadResponse, type GlobResult, type GrepResult, type LocalShellBackendOptions, type LsResult, type ReadRawResult, type ReadResult, type WriteResult } from "deepagents";
import { OpenWikiIgnore } from "./openwiki-ignore.js";
import type { OpenWikiOutputMode } from "./types.js";
/**
 * ToolMessage metadata key under which a successful mutation records the path it wrote.
 */
export declare const MUTATION_PATH_METADATA_KEY = "openwikiMutationPath";
/**
 * Options for {@link OpenWikiLocalShellBackend}, extending the deepagents shell backend options.
 */
type OpenWikiBackendOptions = LocalShellBackendOptions & {
    /**
     * Confine writes to the `openwiki/` docs tree.
     *
     * @default false
     */
    docsOnly?: boolean;
    /**
     * Rules that exclude paths from all agent filesystem/shell access.
     *
     * @default an inactive ruleset (no exclusions)
     */
    openWikiIgnore?: OpenWikiIgnore;
    /**
     * The doc-generation output target, which relaxes the docs-only write check
     * for `local-wiki` runs.
     *
     * @default "repository"
     */
    outputMode?: OpenWikiOutputMode;
    /**
     * Exact generated pages this backend may mutate in repository docs-only mode.
     *
     * `undefined` preserves the existing repository writer behavior. An empty
     * array creates a read-only generated-docs backend.
     */
    writableWikiPages?: readonly string[];
};
/**
 * Filesystem/shell backend that enforces OpenWiki's access boundaries for the
 * doc-generation agent.
 *
 * It wraps the deepagents `LocalShellBackend` and layers on three independent
 * constraints:
 *
 * 1. `.openwikiignore` exclusion: reads/writes/edits of an ignored path are hard
 *    denied with an error; discovery tools (`ls`/`glob`/`grep`) silently drop
 *    ignored entries; uploads/downloads reject ignored paths; and shell
 *    `execute` is restricted to a small allowlist while any rule is active.
 * 2. Docs-only confinement (`docsOnly`): in repository mode, writes are limited
 *    to the `openwiki/` tree via {@link isOpenWikiDocsPath}.
 * 3. Claims ownership: repository `.claims` sidecars are hidden from generic
 *    tools and may only be accessed by OpenWiki's direct persistence layer.
 *
 * All three are security boundaries against an agent that may be prompt-injected via
 * untrusted repository content, so path checks canonicalize before matching.
 */
export declare class OpenWikiLocalShellBackend extends LocalShellBackend {
    /**
     * Whether writes are confined to the `openwiki/` docs tree (repository mode).
     */
    private readonly docsOnly;
    /**
     * The active `.openwikiignore` ruleset gating every path this backend touches.
     */
    private readonly openWikiIgnore;
    /**
     * The doc-generation output target; `local-wiki` relaxes the docs-only write check.
     */
    private readonly outputMode;
    /**
     * Canonical generated pages this worker may mutate, when explicitly scoped.
     */
    private readonly writableWikiPages?;
    constructor(options: OpenWikiBackendOptions);
    /**
     * Read a file, hard-denying the read if the path is excluded by `.openwikiignore`.
     */
    read(filePath: string, offset?: number, limit?: number): Promise<ReadResult>;
    /**
     * Read raw bytes, hard-denying the read if the path is excluded by `.openwikiignore`.
     */
    readRaw(filePath: string): Promise<ReadRawResult>;
    /**
     * Write a file, denying if the path is excluded by `.openwikiignore` or falls
     * outside the docs tree in docs-only mode. On success, records the mutated
     * path in the result metadata for the validator.
     */
    write(filePath: string, content: string): Promise<WriteResult>;
    /**
     * Edit a file in place, applying the same `.openwikiignore` and docs-only
     * checks as {@link write} and recording the mutated path on success.
     */
    edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult>;
    /**
     * Deletes a generated file while enforcing ignore, ownership, and docs-only rules.
     *
     * @param filePath - Virtual file path to delete.
     * @returns Backend deletion result with mutation metadata on success.
     */
    delete(filePath: string): Promise<DeleteResult>;
    /**
     * List a directory, denying if the directory itself is excluded and otherwise
     * filtering out any ignored entries so they never surface to the agent.
     */
    ls(dirPath: string): Promise<LsResult>;
    /**
     * Search file contents, short-circuiting to no matches if the search root is
     * an ignored directory and filtering out matches under any ignored path.
     */
    grep(pattern: string, dirPath?: string | null, glob?: string | null): Promise<GrepResult>;
    /**
     * Expand a glob, short-circuiting to no results if the search root is an
     * ignored directory and filtering out any ignored files from the results.
     */
    glob(pattern: string, searchPath?: string): Promise<GlobResult>;
    /**
     * Upload files, returning `permission_denied` for any path that is excluded by
     * `.openwikiignore` or (in docs-only mode) falls outside the `openwiki/` tree,
     * while still uploading the allowed ones. As a write path, this enforces the
     * same docs-only confinement as {@link write}/{@link edit}. Results are
     * returned in the original input order.
     */
    uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]>;
    /**
     * Download files, returning `permission_denied` for any ignored path while
     * still downloading the allowed ones. Results preserve the input order.
     */
    downloadFiles(paths: string[]): Promise<FileDownloadResponse[]>;
    /**
     * Run a shell command. While any `.openwikiignore` rule is active, only the
     * {@link allowedIgnoredShellCommands} allowlist may run; anything else is
     * refused (exit code 1) with guidance to use the gated filesystem tools,
     * since arbitrary shell cannot be proven not to read an ignored path.
     */
    execute(command: string): Promise<ExecuteResponse>;
    /**
     * Return a refusal message when a write escapes the docs tree in docs-only
     * mode, or `null` if the write is allowed. Always allows in `local-wiki` mode
     * or when the path is under `openwiki/`.
     */
    private getDocsOnlyWriteError;
    /**
     * Return a refusal message when a path is excluded by `.openwikiignore`, or
     * `null` if it is allowed.
     */
    private getIgnoredPathError;
    /**
     * Returns a refusal when a repository path resolves inside Claims state.
     *
     * @param filePath - Candidate virtual repository path.
     * @returns Ownership error, or `null` when generic access is allowed.
     */
    private getClaimsOwnershipError;
    /**
     * Determines whether a path is reserved Claims state for this output mode.
     *
     * @param filePath - Candidate virtual path.
     * @returns Whether the repository Claims boundary applies.
     */
    private isClaimsPath;
    /**
     * Resolves search-relative glob results before checking Claims ownership.
     *
     * @param filePath - Path returned by the underlying discovery operation.
     * @param searchPath - Virtual discovery root.
     * @returns Whether the discovered entry belongs to Claims state.
     */
    private isClaimsDiscoveryPath;
    /**
     * Whether writing to a path is disallowed, combining the `.openwikiignore`
     * exclusion and the docs-only confinement checks that {@link write} and
     * {@link edit} apply. Used by batch write paths that cannot short-circuit on a
     * single error message.
     */
    private isWriteBlocked;
}
/**
 * Determines whether a virtual path resolves inside OpenWiki-owned Claims state.
 *
 * @param filePath - Candidate virtual repository path.
 * @returns Whether the normalized path is the Claims directory or its descendant.
 */
export declare function isClaimsStatePath(filePath: string): boolean;
/**
 * Whether a path resolves to somewhere inside the `openwiki/` docs tree.
 *
 * The path is canonicalized (backslashes, leading slashes, and `.`/`..`
 * segments collapsed) before the prefix check so a path such as
 * `/openwiki/../AGENTS.md` cannot escape the confinement.
 */
export declare function isOpenWikiDocsPath(filePath: string): boolean;
export {};
