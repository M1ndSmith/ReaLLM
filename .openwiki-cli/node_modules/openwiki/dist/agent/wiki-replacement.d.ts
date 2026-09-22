/**
 * Recoverable replacement of one existing repository wiki.
 */
export interface RepositoryWikiReplacement {
    /** Discards the private backup after a successful init. */
    commit(): Promise<void>;
    /** Restores the exact pre-init wiki after a failed init. */
    rollback(): Promise<void>;
}
/**
 * Replaces an existing repository wiki with a blank generation target.
 *
 * `INSTRUCTIONS.md` is user-owned control metadata, so it is copied into the
 * blank target. Everything else below `openwiki/` is generated state and is
 * removed before the init agent sees the repository. A private temporary copy
 * remains available until the run either commits or rolls back.
 *
 * SIGINT and SIGTERM restore the backup before exiting. This keeps an operator
 * cancellation from leaving the repository with a partial replacement wiki.
 *
 * A first init with no `openwiki/` directory keeps the existing partial-run
 * recovery behavior and therefore returns a no-op transaction.
 *
 * @param rootDir - Absolute repository root.
 * @returns Transaction controlling the pre-init backup.
 */
export declare function beginRepositoryWikiReplacement(rootDir: string): Promise<RepositoryWikiReplacement>;
