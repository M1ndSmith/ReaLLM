import type { BackendProtocolV2 } from "deepagents";
import type { OpenWikiOutputMode } from "../agent/types.js";
/**
 * Persisted producer event captured before an agent run.
 */
interface GeneratedEvent {
    /**
     * Producer actor responsible for the prior body change.
     */
    by: string;
    /**
     * Producer-recorded time of the prior body change.
     *
     * @default undefined - the prior event did not record a time.
     */
    at?: string;
}
/**
 * Minimal pre-run state needed to finalize one concept's provenance.
 */
interface ConceptSnapshot {
    /**
     * Hash of the exact Markdown body, excluding front matter.
     */
    bodyHash: string;
    /**
     * Valid producer event present before the run.
     *
     * @default undefined - the page had no valid generated event.
     */
    generated?: GeneratedEvent;
}
/**
 * Run-scoped provenance baseline keyed by virtual concept path.
 */
export type GeneratedProvenanceSnapshot = ReadonlyMap<string, ConceptSnapshot>;
/**
 * JSON-safe representation of one pre-run generated-page baseline.
 */
export interface PersistedGeneratedProvenanceEntry {
    /**
     * Canonical virtual path of the generated Markdown page.
     */
    page: string;
    /**
     * Hash of the page body before this run began authoring.
     */
    bodyHash: string;
    /**
     * Existing generated-provenance metadata, when the page had it.
     */
    generated?: {
        /**
         * Producer recorded in the page's generated metadata.
         */
        by: string;
        /**
         * Generation timestamp recorded by the prior successful run.
         */
        at?: string;
    };
}
/**
 * Deterministically ordered persisted provenance baseline.
 */
export type PersistedGeneratedProvenanceSnapshot = PersistedGeneratedProvenanceEntry[];
/**
 * Serializes the exact pre-authoring baseline without changing its meaning.
 */
export declare function serializeGeneratedProvenance(snapshot: GeneratedProvenanceSnapshot): PersistedGeneratedProvenanceSnapshot;
/**
 * Recreates the in-memory provenance baseline after process restart.
 */
export declare function deserializeGeneratedProvenance(persisted: PersistedGeneratedProvenanceSnapshot): GeneratedProvenanceSnapshot;
/**
 * Captures finalization inputs for every concept present before the agent runs.
 * Only hashes and the prior producer event are retained, keeping the snapshot
 * bounded without creating temporary files beside generated documentation.
 *
 * @param backend - Active wiki filesystem abstraction.
 * @param outputMode - Current wiki target.
 * @returns Pre-run concept state keyed by virtual page path.
 */
export declare function snapshotGeneratedProvenance(backend: BackendProtocolV2, outputMode: OpenWikiOutputMode): Promise<GeneratedProvenanceSnapshot>;
/**
 * Reconciles producer provenance against the final post-processed wiki.
 * New pages and pages whose bodies changed in any way receive the run stamp.
 * An unchanged body receives its prior stamp back when an agent rewrite removed
 * or altered it; pages that were previously unstamped remain unstamped.
 *
 * @param backend - Active wiki filesystem abstraction.
 * @param outputMode - Current wiki target.
 * @param initialConcepts - Pre-run state keyed by virtual page path.
 * @param now - Shared run timestamp used for new generated events.
 * @param producerActor - Producer responsible for body changes in this run.
 * @param producerActorsByPage - Page-specific producer overrides.
 */
export declare function finalizeGeneratedProvenance(backend: BackendProtocolV2, outputMode: OpenWikiOutputMode, initialConcepts: GeneratedProvenanceSnapshot, now: string, producerActor: string, producerActorsByPage?: ReadonlyMap<string, string>): Promise<void>;
export {};
