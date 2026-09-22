import type { HostIntegrationStatus, HostTarget, InstallOptions, InstallResult, UninstallOptions } from "./types.js";
/**
 * Injectable file operations used by transaction-failure tests.
 */
export interface HostIntegrationInstallerOperations {
    /**
     * Atomically moves one filesystem entry.
     *
     * @param source - Existing source path.
     * @param destination - Non-existing destination path.
     */
    move(source: string, destination: string): Promise<void>;
    /**
     * Recursively removes one private staging or backup directory.
     *
     * @param directory - Directory owned by the active installer transaction.
     */
    removeDirectory(directory: string): Promise<void>;
}
/**
 * Optional deterministic inputs for one installer service.
 */
export interface HostIntegrationInstallerOptions {
    /**
     * File operations used for commit and cleanup steps.
     *
     * @default Node.js rename and recursive removal.
     */
    operations?: HostIntegrationInstallerOperations;
    /**
     * Clock used to name retained forced backups.
     *
     * @default () => new Date()
     */
    now?: () => Date;
    /**
     * Unique identifier source for private sibling paths.
     *
     * @default randomUUID
     */
    createId?: () => string;
    /**
     * Module URL used to resolve the source or built package root.
     *
     * @default import.meta.url
     */
    moduleUrl?: string;
}
/**
 * Transactional installer service with injectable commit operations.
 */
export declare class HostIntegrationInstaller {
    /**
     * File operations used for atomic moves and private-directory cleanup.
     */
    private readonly operations;
    /**
     * Clock used for human-recognizable forced backup names.
     */
    private readonly now;
    /**
     * Unique identifier source used for collision-resistant sibling paths.
     */
    private readonly createId;
    /**
     * Canonical package-owned skill bundle.
     */
    private readonly bundleDirectory;
    /**
     * Creates an installer service.
     *
     * @param options - Optional deterministic file operations and path inputs.
     */
    constructor(options?: HostIntegrationInstallerOptions);
    /**
     * Installs or upgrades one host integration transactionally.
     *
     * @param target - Registry entry for the target host.
     * @param options - Installation scope, root, and conflict policy.
     * @returns Installed paths, mutation status, and any retained backup.
     */
    install(target: HostTarget, options: InstallOptions): Promise<InstallResult>;
    /**
     * Removes one unmodified managed host integration transactionally.
     *
     * @param target - Registry entry for the target host.
     * @param options - Installation scope and root containing the integration.
     * @returns Removed paths, mutation status, and any retained cleanup backup.
     */
    uninstall(target: HostTarget, options: UninstallOptions): Promise<InstallResult>;
    /**
     * Reports whether a host integration is absent, intact, or modified.
     *
     * @param target - Registry entry for the target host.
     * @param options - Installation scope and root to inspect.
     * @returns Current managed installation status.
     */
    status(target: HostTarget, options: UninstallOptions): Promise<HostIntegrationStatus>;
    /**
     * Mutates config and atomically commits a non-idempotent skill install.
     *
     * @param target - Registry target receiving the integration.
     * @param context - Canonical transaction paths.
     * @param staging - Fully inventoried staged skill directory.
     * @param hasPriorSkill - Whether a destination must be moved aside.
     * @param force - Whether the prior skill must be retained as a backup.
     * @param mcpServerCommand - Exact MCP server invocation to install.
     * @param replaceMcpServerCommand - Exact prior invocation that may be replaced.
     * @returns Committed installation result.
     */
    private commitInstall;
    /**
     * Removes an unmodified rollback directory or retains a forced backup.
     *
     * @param priorSkill - Prior skill moved aside during commit.
     * @param force - Whether the prior skill must be retained.
     * @returns Retained backup path, when one remains.
     */
    private cleanupPriorSkill;
    /**
     * Restores config and prior skill state after an install commit fails.
     *
     * @param context - Resolved transaction paths.
     * @param staging - Private staged skill directory.
     * @param priorSkill - Prior skill moved aside before the failure.
     * @param configSnapshot - Config snapshot when the adapter changed it.
     * @param originalError - Failure that initiated rollback.
     */
    private rollbackInstall;
}
/**
 * Installs or upgrades one host integration transactionally.
 *
 * @param target - Registry entry for the target host.
 * @param options - Installation scope, root, and conflict policy.
 * @returns Installed paths, mutation status, and any retained backup.
 */
export declare function installHostIntegration(target: HostTarget, options: InstallOptions): Promise<InstallResult>;
/**
 * Removes one unmodified managed host integration transactionally.
 *
 * @param target - Registry entry for the target host.
 * @param options - Installation scope and root containing the integration.
 * @returns Removed paths, mutation status, and any retained cleanup backup.
 */
export declare function uninstallHostIntegration(target: HostTarget, options: UninstallOptions): Promise<InstallResult>;
/**
 * Reports whether a host integration is absent, intact, or modified.
 *
 * @param target - Registry entry for the target host.
 * @param options - Installation scope and root to inspect.
 * @returns Current managed installation status.
 */
export declare function getHostIntegrationStatus(target: HostTarget, options: UninstallOptions): Promise<HostIntegrationStatus>;
/**
 * Resolves the canonical host skill from a source or built installer module.
 *
 * @param moduleUrl - Source or built installer module URL.
 * @returns Absolute canonical skill bundle path.
 */
export declare function resolveCanonicalSkillBundle(moduleUrl?: string): string;
