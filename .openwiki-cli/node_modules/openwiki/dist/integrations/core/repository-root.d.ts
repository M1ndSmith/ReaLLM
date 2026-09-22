/**
 * Resolves an absolute path to its canonical Git worktree root.
 *
 * The lifecycle boundary deliberately refuses the filesystem root and the
 * current user's home directory. This prevents a globally installed host
 * integration from treating an ambiguous agent launch directory as a wiki
 * repository.
 *
 * @param candidate - Absolute directory supplied by the host skill.
 * @returns Canonical absolute Git worktree root.
 */
export declare function resolveRepositoryRoot(candidate: string): Promise<string>;
