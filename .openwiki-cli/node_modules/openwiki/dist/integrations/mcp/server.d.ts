import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProtocolTool } from "../core/protocol.js";
/**
 * Minimal lifecycle capability required by the MCP transport adapter.
 */
export interface HostToolProvider {
    /**
     * Returns the complete transport-neutral lifecycle tool set.
     *
     * @returns Tools to register with the MCP server.
     */
    tools(): readonly ProtocolTool[];
}
/**
 * Creates the thin MCP adapter over a transport-neutral lifecycle provider.
 *
 * @param provider - Rootless lifecycle tool provider.
 * @returns Unconnected MCP server exposing the provider's tools.
 */
export declare function createOpenWikiMcpServer(provider: HostToolProvider): McpServer;
