import type { HostIntegrationStatus, HostMcpServerCommand } from "./types.js";
/**
 * Installs an exact managed OpenWiki TOML block.
 *
 * @param filePath - Absolute Codex TOML config path.
 * @param entry - Exact executable invocation to install.
 * @param replaceableEntry - Exact prior invocation that may be replaced.
 * @returns Whether the config changed.
 */
export declare function installCodexMcpBlock(filePath: string, entry: HostMcpServerCommand, replaceableEntry?: HostMcpServerCommand): Promise<boolean>;
/**
 * Removes only the exact managed OpenWiki TOML block.
 *
 * @param filePath - Absolute Codex TOML config path.
 * @param entry - Exact executable invocation owned by OpenWiki.
 * @returns Whether the config changed.
 */
export declare function uninstallCodexMcpBlock(filePath: string, entry: HostMcpServerCommand): Promise<boolean>;
/**
 * Reports whether the exact managed Codex block is absent, intact, or modified.
 *
 * @param filePath - Absolute Codex TOML config path.
 * @param entry - Exact executable invocation expected in the managed block.
 * @returns Current managed-block state.
 */
export declare function getCodexMcpBlockStatus(filePath: string, entry: HostMcpServerCommand): Promise<HostIntegrationStatus>;
