import type { HostIntegrationStatus, HostMcpServerCommand } from "./types.js";
/**
 * Installs the managed OpenWiki entry without discarding unrelated config.
 */
export declare function installOpencodeMcpEntry(filePath: string, entry: HostMcpServerCommand, replaceableEntry?: HostMcpServerCommand): Promise<boolean>;
/**
 * Removes only an exact managed OpenWiki entry.
 */
export declare function uninstallOpencodeMcpEntry(filePath: string, expected: HostMcpServerCommand): Promise<boolean>;
/**
 * Reports whether the exact managed entry is absent, intact, or modified.
 */
export declare function getOpencodeMcpEntryStatus(filePath: string, expected: HostMcpServerCommand): Promise<HostIntegrationStatus>;
