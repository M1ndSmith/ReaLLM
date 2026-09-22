import type { Run } from "langsmith";
/**
 * A resolved LangSmith project: its UUID and canonical UI URL base.
 */
export interface ResolvedProject {
    /**
     * Project UUID, required by run queries.
     */
    id: string;
    /**
     * Canonical LangSmith UI URL for the project.
     */
    url: string;
}
/**
 * The operations the LangSmith connector needs from the SDK.
 */
export interface LangSmithApi {
    /**
     * Resolves a project (tracing session) name to its UUID and URL base.
     */
    resolveProject(name: string): Promise<ResolvedProject>;
    /**
     * Root runs (newest first, capped at limit) since startTime, or with no lower
     * bound when startTime is undefined. Lean fields only (no payloads) — this is
     * the recent batch the connector classifies client-side into the
     * anomaly-weighted sample before fetching full trees.
     */
    listRootRuns(projectId: string, options: {
        limit: number;
        startTime?: string;
    }): Promise<Run[]>;
    /**
     * All runs in one trace (root plus descendants), for full-tree compaction.
     */
    fetchTrace(traceId: string): Promise<Run[]>;
}
/**
 * Creates a LangSmith API wrapper bound to one base URL and API key. The key is
 * handed to the SDK Client and never stored on the returned object, so it cannot
 * leak through logging or serialization of the wrapper.
 */
export declare function createLangSmithApi(baseUrl: string, apiKey: string): LangSmithApi;
/**
 * True when the error is a LangSmith rate-limit (HTTP 429). The SDK throws a
 * plain Error whose message carries the status, e.g. "... Received status [429]:
 * ... Rate limit exceeded".
 */
export declare function isRateLimitError(error: unknown): boolean;
