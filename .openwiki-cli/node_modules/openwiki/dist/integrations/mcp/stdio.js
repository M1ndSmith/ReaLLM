import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { HostSessionManager } from "../core/session-manager.js";
import { createOpenWikiMcpServer } from "./server.js";
/**
 * Starts OpenWiki's local stdio MCP server without writing to stdout.
 *
 * @param options - Host identifier used for run metadata.
 */
export async function runOpenWikiMcp(options) {
    const manager = HostSessionManager.create(options);
    const server = createOpenWikiMcpServer(manager);
    await server.connect(new StdioServerTransport());
}
