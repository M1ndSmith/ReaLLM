import type { McpConnectorConfig, McpReadOnlyOperation } from "./types.js";
export type McpExecutionResult = {
    operations: {
        name: string;
        result: unknown;
        type: McpReadOnlyOperation["type"];
    }[];
    transport: {
        command?: string;
        type: "http" | "stdio";
        url?: string;
    };
};
export type McpToolListResult = {
    tools: McpToolDescriptor[];
    transport: {
        command?: string;
        type: "http" | "stdio";
        url?: string;
    };
};
export type McpToolDescriptor = {
    annotations?: Record<string, unknown>;
    description?: string;
    inputSchema?: unknown;
    name: string;
};
export declare function executeMcpReadOnlyOperations(config: McpConnectorConfig): Promise<McpExecutionResult>;
export declare function listMcpTools(config: McpConnectorConfig): Promise<McpToolListResult>;
export declare function executeMcpTool(config: McpConnectorConfig, name: string, args?: Record<string, unknown>): Promise<unknown>;
export declare function buildChildEnv(envRefs: Record<string, string>): Record<string, string>;
