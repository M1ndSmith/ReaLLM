import { validateWikiMermaid } from "../mermaid/wiki.js";
import { deserializeGeneratedProvenance, finalizeGeneratedProvenance, serializeGeneratedProvenance, snapshotGeneratedProvenance, } from "../okf/generated-provenance.js";
import { synchronizeClaimSources, } from "../okf/claim-sources.js";
import { migrateWikiToOkf, synchronizeWikiIndexes } from "../okf/index-sync.js";
import { ENGLISH_CONCEPT_TYPE, ENGLISH_INDEX_LABELS, } from "../okf/index-labels.js";
import { OPENWIKI_PRODUCER_ACTOR } from "../version.js";
import { validateWikiInternalLinks } from "./wiki-link-validator.js";
/**
 * Serializes the preparation state required by deterministic finalization.
 */
export function serializePreparedWikiState(prepared) {
    return {
        generatedProvenance: serializeGeneratedProvenance(prepared.generatedProvenance),
    };
}
/**
 * Recreates deterministic finalization state after process restart.
 */
export function deserializePreparedWikiState(persisted) {
    return {
        generatedProvenance: deserializeGeneratedProvenance(persisted.generatedProvenance),
    };
}
/**
 * Migrates existing concepts and captures their pre-authoring provenance.
 *
 * @param options - Preparation inputs for the active wiki.
 * @returns Run-scoped state required by finalization.
 */
export async function prepareWikiForAuthoring({ backend, outputMode, conceptType = ENGLISH_CONCEPT_TYPE, runOperation = runWikiOperation, }) {
    await runOperation("migrate", () => migrateWikiToOkf(backend, outputMode, conceptType));
    return {
        generatedProvenance: await runOperation("provenance_snapshot", () => snapshotGeneratedProvenance(backend, outputMode)),
    };
}
/**
 * Runs deterministic post-authoring validation, index synchronization, and
 * generated-provenance reconciliation in internal-agent order.
 *
 * @param options - Finalization inputs and matching preparation state.
 */
export async function finalizeWikiArtifacts({ backend, outputMode, labels = ENGLISH_INDEX_LABELS, conceptType = ENGLISH_CONCEPT_TYPE, prepared, at, producerActor = OPENWIKI_PRODUCER_ACTOR, producerActorsByPage, claimSources, runOperation = runWikiOperation, }) {
    if (producerActor.trim().length === 0) {
        throw new Error("Wiki finalization requires a non-empty producer actor.");
    }
    await runOperation("mermaid", () => validateWikiMermaid(backend, outputMode));
    await runOperation("index_sync", () => synchronizeWikiIndexes(backend, outputMode, labels, conceptType));
    await runOperation("link_validation", () => validateWikiInternalLinks(backend, outputMode));
    if (claimSources) {
        await runOperation("claims_sources", () => synchronizeClaimSources(backend, outputMode, claimSources));
    }
    await runOperation("generated_provenance", () => finalizeGeneratedProvenance(backend, outputMode, prepared.generatedProvenance, at, producerActor, producerActorsByPage));
}
/**
 * Executes a lifecycle operation directly when no caller wrapper is supplied.
 *
 * @param _operation - Stable operation identifier, unused without a wrapper.
 * @param task - Deferred lifecycle work.
 * @returns Value produced by the lifecycle operation.
 */
async function runWikiOperation(_operation, task) {
    return task();
}
