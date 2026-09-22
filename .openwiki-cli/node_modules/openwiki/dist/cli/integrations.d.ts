import type { CliCommand } from "./commands.js";
/**
 * Executes a registry-driven integration list, install, or uninstall command.
 *
 * @param command - Parsed integration command.
 */
export declare function runIntegrationsCommand(command: Extract<CliCommand, {
    kind: "integrations";
}>): Promise<void>;
/**
 * Starts the local stdio MCP server for a parsed CLI command.
 *
 * @param command - Parsed MCP server command.
 */
export declare function runMcpCommand(command: Extract<CliCommand, {
    kind: "mcp";
}>): Promise<void>;
