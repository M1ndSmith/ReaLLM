import type { ConnectorDefinition, ConnectorRuntime } from "../types.js";
type McpConnectorInput = Pick<ConnectorDefinition, "description" | "displayName" | "id" | "requiredEnv">;
export declare function createMcpConnector(input: McpConnectorInput): ConnectorRuntime;
export {};
