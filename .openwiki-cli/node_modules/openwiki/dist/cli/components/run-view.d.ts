import React from "react";
import type { OpenWikiCommand } from "../../agent/types.js";
import type { CredentialDiagnostic } from "../../config/env.js";
import type { OpenWikiIngestionResult } from "../../ingestion/ingestion.js";
import type { RunLogItem } from "../run-log/types.js";
/**
 * Props for the per-source ingestion summary.
 */
interface IngestionSummaryProps {
    /**
     * Settled ingestion result containing one entry per configured source.
     */
    result: OpenWikiIngestionResult;
}
/**
 * A per-source summary of an ingestion run, one status line per source.
 */
export declare function IngestionSummary({ result }: IngestionSummaryProps): React.JSX.Element;
/**
 * Props for the live/completed agent run view.
 */
interface RunViewProps {
    /**
     * OpenWiki operation represented by the view.
     */
    command: OpenWikiCommand;
    /**
     * Opt-in credential diagnostics captured for this run.
     *
     * @default undefined - credential diagnostics are hidden.
     */
    credentialDiagnostics?: CredentialDiagnostic[];
    /**
     * Bounded progress and completion model for the run.
     */
    log: RunLogItem[];
    /**
     * Whether to render a finished run instead of live progress.
     *
     * @default false
     */
    done?: boolean;
    /**
     * Elapsed wall-clock time for an agent run.
     *
     * @default undefined - omitted for views that do not own the run timer.
     */
    durationMs?: number;
    /**
     * Echoed user prompt to show above the run.
     *
     * @default null - no prompt is shown.
     */
    message?: string | null;
    /**
     * Explicit model id for the header.
     *
     * @default null - the header resolves the configured default model.
     */
    modelId?: string | null;
}
/**
 * The live agent run view: a compact header, stable run status, and bounded
 * repository/OpenWiki activity trees.
 */
export declare function RunView({ command, credentialDiagnostics, log, done, durationMs, message, modelId, }: RunViewProps): React.JSX.Element;
/**
 * Props for the completed-run detail block.
 */
interface CompletedRunDetailsProps {
    /**
     * OpenWiki operation represented by the completed run.
     */
    command: OpenWikiCommand;
    /**
     * Bounded run log containing summary counts, written paths, and final text.
     */
    log: RunLogItem[];
}
/**
 * Renders written pages, aggregate counts, diagnostics, and the final assistant
 * response for a completed run.
 */
export declare function CompletedRunDetails({ command, log, }: CompletedRunDetailsProps): React.JSX.Element;
export {};
