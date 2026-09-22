import type { HostIntegrationStatus, HostMcpServerCommand } from "./types.js";
/**
 * Installs the managed OpenWiki entry without discarding unrelated config.
 *
 * @param filePath - Absolute JSON config path.
 * @param entry - Exact registry-derived entry to own.
 * @param replaceableEntry - Exact prior entry that may be replaced.
 * @returns Whether the config changed.
 */
export declare function installJsonMcpEntry(filePath: string, entry: HostMcpServerCommand, replaceableEntry?: HostMcpServerCommand): Promise<boolean>;
/**
 * Removes only an exact managed OpenWiki entry.
 *
 * @param filePath - Absolute JSON config path.
 * @param expected - Exact entry previously installed by OpenWiki.
 * @returns Whether the config changed.
 */
export declare function uninstallJsonMcpEntry(filePath: string, expected: HostMcpServerCommand): Promise<boolean>;
/**
 * Reports whether the exact managed JSON entry is absent, intact, or modified.
 *
 * @param filePath - Absolute JSON config path.
 * @param expected - Exact registry-derived entry OpenWiki owns.
 * @returns Current managed-entry state.
 */
export declare function getJsonMcpEntryStatus(filePath: string, expected: HostMcpServerCommand): Promise<HostIntegrationStatus>;
