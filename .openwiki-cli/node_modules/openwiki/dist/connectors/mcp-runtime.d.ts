import { type McpToolDescriptor } from "./mcp-client.js";
import type { ConnectorId, McpConnectorConfig } from "./types.js";
export type McpConnectorId = Extract<ConnectorId, "custom-mcp" | "notion">;
export type McpToolDiscoveryResult = {
    connectorId: McpConnectorId;
    rawFile: string;
    runId: string;
    tools: McpToolDescriptor[];
};
export type McpToolCallResult = {
    allowedBy: string;
    connectorId: McpConnectorId;
    rawFile: string;
    result: unknown;
    runId: string;
    toolName: string;
};
export declare function isMcpConnectorId(connectorId: ConnectorId): connectorId is McpConnectorId;
export declare function discoverMcpConnectorTools(connectorId: McpConnectorId): Promise<McpToolDiscoveryResult>;
export declare function callMcpConnectorTool(connectorId: McpConnectorId, toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
export declare function sanitizeMcpTransport(transport: McpConnectorConfig["transport"]): McpConnectorConfig["transport"] | null;
