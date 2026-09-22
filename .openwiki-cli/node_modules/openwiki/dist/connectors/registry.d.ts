import type { ConnectorId, ConnectorRuntime } from "./types.js";
export declare const CONNECTOR_IDS: readonly ["custom-mcp", "git-repo", "notion", "x", "google", "web-search", "hackernews", "langsmith", "slack"];
export declare function createConnectorRegistry(): Record<ConnectorId, ConnectorRuntime>;
export declare function isConnectorId(value: string): value is ConnectorId;
/**
 * Connector ids that require auth and have all required env vars set. Used by
 * telemetry as an adoption signal.
 */
export declare function getConfiguredConnectorIds(): ConnectorId[];
