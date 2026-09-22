import type { ConnectorId, ConnectorIngestResult, ConnectorRuntime } from "../connectors/types.js";
import type { OpenWikiRunOptions, OpenWikiRunResult } from "../agent/types.js";
export type IngestionTarget = ConnectorId | "all" | SourceInstanceTarget;
export type SourceInstanceTarget = {
    kind: "source-instance";
    id: string;
};
export type SourceIngestionResult = {
    agentResult?: OpenWikiRunResult;
    connectorId: ConnectorId;
    deterministicPull?: ConnectorIngestResult;
    displayName: string;
    rawFiles: string[];
    sourceInstanceId: string;
    status: "agent-updated" | "error" | "skipped";
};
export type OpenWikiIngestionResult = {
    results: SourceIngestionResult[];
};
export type OpenWikiIngestionOptions = Pick<OpenWikiRunOptions, "debug" | "modelId" | "onEvent"> & {
    scheduledOnly?: boolean;
    target: IngestionTarget;
};
export declare function runOpenWikiIngestion(_cwd: string | undefined, options: OpenWikiIngestionOptions): Promise<OpenWikiIngestionResult>;
export declare function parseIngestionTarget(value: string): IngestionTarget | null;
export declare function createConnectorSynthesisGuidance(connector: ConnectorRuntime): string;
