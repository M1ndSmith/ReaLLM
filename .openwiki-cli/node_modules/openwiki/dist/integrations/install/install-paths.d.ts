import type { HostMcpConfig, HostIntegrationScope, HostTarget, InstallResult } from "./types.js";
/**
 * Exact pre-mutation state of one optional UTF-8 config file.
 */
export interface TextFileSnapshot {
    /**
     * Whether the config existed before mutation.
     */
    existed: boolean;
    /**
     * Exact prior UTF-8 bytes when the config existed.
     *
     * @default undefined - the config did not exist.
     */
    content?: string;
}
/**
 * Resolved canonical paths for one host transaction.
 */
export interface InstallContext {
    /**
     * Ownership scope for this transaction.
     */
    scope: HostIntegrationScope;
    /**
     * Canonical home or project root anchoring the transaction.
     */
    root: string;
    /**
     * Absolute host-owned skill directory.
     */
    skillDirectory: string;
    /**
     * Absolute host-owned MCP config path.
     */
    mcpConfig: string;
    /**
     * Config representation selected by the registry for this scope.
     */
    mcpConfigKind: HostMcpConfig["kind"];
}
/**
 * Resolves canonical transaction paths and rejects symlinked components.
 *
 * @param target - Registry entry supplying scope-relative destinations.
 * @param scope - User or project ownership scope.
 * @param candidateRoot - Home or project root anchoring the scope.
 * @returns Canonical scope, skill, and config paths.
 */
export declare function resolveInstallContext(target: HostTarget, scope: HostIntegrationScope, candidateRoot: string): Promise<InstallContext>;
/**
 * Rejects symbolic links in every existing destination component.
 *
 * @param root - Canonical installation root.
 * @param destination - Contained absolute destination path.
 */
export declare function assertNoSymlinkComponents(root: string, destination: string): Promise<void>;
/**
 * Snapshots an optional UTF-8 config before a transaction.
 *
 * @param filePath - Absolute config path.
 * @returns Exact content or an absence marker.
 */
export declare function snapshotTextFile(filePath: string): Promise<TextFileSnapshot>;
/**
 * Restores an exact config snapshot after a pre-commit failure.
 *
 * @param filePath - Absolute config path.
 * @param snapshot - Pre-mutation bytes or absence marker.
 */
export declare function restoreTextFile(filePath: string, snapshot: TextFileSnapshot): Promise<void>;
/**
 * Produces one private sibling transaction path.
 *
 * @param destination - Managed skill destination.
 * @param purpose - Transaction path purpose.
 * @param id - Collision-resistant identifier.
 * @returns Absolute private sibling path.
 */
export declare function siblingPath(destination: string, purpose: "rollback" | "staging" | "uninstall", id: string): string;
/**
 * Produces one retained, timestamped forced-replacement backup path.
 *
 * @param destination - Managed skill destination.
 * @param now - Backup timestamp.
 * @param id - Collision-resistant identifier.
 * @returns Absolute retained sibling backup path.
 */
export declare function forcedBackupPath(destination: string, now: Date, id: string): string;
/**
 * Removes empty skill ancestors without deleting host-owned root directories.
 *
 * @param root - Canonical installation root.
 * @param skillDirectory - Removed managed skill path.
 */
export declare function removeEmptySkillParents(root: string, skillDirectory: string): Promise<void>;
/**
 * Creates one stable public result object.
 *
 * @param target - Affected registry target.
 * @param context - Canonical scope paths.
 * @param changed - Whether managed state changed.
 * @param backupPath - Optional retained sibling backup.
 * @returns Public installation result.
 */
export declare function resultFor(target: HostTarget, context: InstallContext, changed: boolean, backupPath?: string): InstallResult;
