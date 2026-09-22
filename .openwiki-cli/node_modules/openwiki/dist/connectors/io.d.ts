import type { ConnectorId, ConnectorState } from "./types.js";
export declare function readConnectorConfig<T extends object>(connectorId: ConnectorId, defaultConfig: T): Promise<T>;
export declare function readConnectorState(connectorId: ConnectorId): Promise<ConnectorState>;
export declare function writeConnectorState(connectorId: ConnectorId, state: ConnectorState): Promise<void>;
export declare function writeRawJson(connectorId: ConnectorId, runId: string, filename: string, value: unknown): Promise<string>;
export declare function createRunId(): string;
export declare function updateStateWithRun(state: ConnectorState, run: NonNullable<ConnectorState["runs"]>[number]): ConnectorState;
