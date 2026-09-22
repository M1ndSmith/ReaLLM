import type { HostIntegrationStatus, HostMcpServerCommand, HostTargetId } from "./types.js";
/**
 * Ownership receipt stored inside one installed skill directory.
 */
export interface SkillReceipt {
    /**
     * Package that owns the installed files.
     */
    package: "openwiki";
    /**
     * OpenWiki package version that produced the installation.
     */
    version: string;
    /**
     * Host target that owns the destination directory.
     */
    target: HostTargetId;
    /**
     * Exact MCP server invocation installed alongside the skill.
     */
    mcpServerCommand: HostMcpServerCommand;
    /**
     * SHA-256 hashes keyed by installed relative path.
     */
    files: Record<string, string>;
}
/**
 * Deterministic inventory of one canonical or installed skill directory.
 */
export interface SkillInventory {
    /**
     * SHA-256 hashes keyed by portable relative file path.
     */
    files: Record<string, string>;
}
/**
 * Inspection result for one skill destination.
 */
export interface InstallationInspection {
    /**
     * Current ownership and integrity state.
     */
    status: HostIntegrationStatus;
    /**
     * Validated receipt for an intact managed installation.
     *
     * @default undefined - the destination is absent or modified.
     */
    receipt?: SkillReceipt;
}
/**
 * Resolves the canonical host skill from a source or built installer module.
 *
 * @param moduleUrl - Source or built installer module URL.
 * @returns Absolute canonical skill bundle path.
 */
export declare function resolveCanonicalSkillBundle(moduleUrl: string): string;
/**
 * Inventories and validates one canonical or installed skill directory.
 *
 * @param directory - Skill directory to inspect.
 * @param allowReceipt - Whether the managed receipt may exist at the root.
 * @returns Deterministic relative-path hash inventory.
 */
export declare function inventorySkill(directory: string, allowReceipt: boolean): Promise<SkillInventory>;
/**
 * Writes a deterministic ownership receipt into a staged skill.
 *
 * @param directory - Staged skill directory.
 * @param target - Registry host owning the destination.
 * @param files - Canonical file hashes copied into staging.
 * @param mcpServerCommand - Exact MCP server invocation installed with the skill.
 */
export declare function writeReceipt(directory: string, target: HostTargetId, files: Record<string, string>, mcpServerCommand: HostMcpServerCommand): Promise<void>;
/**
 * Inspects ownership and exact content integrity for one destination.
 *
 * @param directory - Host-owned skill destination.
 * @param target - Host expected by the receipt.
 * @returns Absent, intact, or modified state and any valid receipt.
 */
export declare function inspectInstallation(directory: string, target: HostTargetId): Promise<InstallationInspection>;
/**
 * Compares two deterministic file-hash maps.
 *
 * @param left - First inventory.
 * @param right - Second inventory.
 * @returns Whether both contain exactly the same paths and hashes.
 */
export declare function sameFiles(left: Record<string, string>, right: Record<string, string>): boolean;
