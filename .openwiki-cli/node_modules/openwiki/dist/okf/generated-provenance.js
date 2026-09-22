import { createHash } from "node:crypto";
import { parseFrontmatterFields, repairOkfFrontmatter, removeFrontmatterField, setGeneratedEvent, splitFrontmatter, } from "./frontmatter.js";
import { listWikiConceptPaths } from "./index-sync.js";
/**
 * Serializes the exact pre-authoring baseline without changing its meaning.
 */
export function serializeGeneratedProvenance(snapshot) {
    return [...snapshot.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([page, value]) => ({
        page,
        bodyHash: value.bodyHash,
        ...(value.generated
            ? {
                generated: {
                    by: value.generated.by,
                    ...(value.generated.at ? { at: value.generated.at } : {}),
                },
            }
            : {}),
    }));
}
/**
 * Recreates the in-memory provenance baseline after process restart.
 */
export function deserializeGeneratedProvenance(persisted) {
    return new Map(persisted.map(({ page, bodyHash, generated }) => [
        page,
        {
            bodyHash,
            ...(generated ? { generated: { ...generated } } : {}),
        },
    ]));
}
/**
 * Captures finalization inputs for every concept present before the agent runs.
 * Only hashes and the prior producer event are retained, keeping the snapshot
 * bounded without creating temporary files beside generated documentation.
 *
 * @param backend - Active wiki filesystem abstraction.
 * @param outputMode - Current wiki target.
 * @returns Pre-run concept state keyed by virtual page path.
 */
export async function snapshotGeneratedProvenance(backend, outputMode) {
    const snapshots = new Map();
    for (const page of await listWikiConceptPaths(backend, outputMode)) {
        const content = await readRequiredContent(backend, page);
        snapshots.set(page, {
            bodyHash: hashConceptBody(content),
            generated: readGeneratedEvent(content),
        });
    }
    return snapshots;
}
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
export async function finalizeGeneratedProvenance(backend, outputMode, initialConcepts, now, producerActor, producerActorsByPage) {
    if (producerActor.trim().length === 0) {
        throw new Error("Generated provenance requires a non-empty producer actor.");
    }
    for (const [page, actor] of producerActorsByPage ?? []) {
        if (actor.trim().length === 0) {
            throw new Error(`Generated provenance requires a non-empty producer actor for ${page}.`);
        }
    }
    for (const page of await listWikiConceptPaths(backend, outputMode)) {
        let content;
        try {
            content = await readRequiredContent(backend, page);
        }
        catch {
            // Generated provenance is optional trust metadata. If a page cannot be
            // read during this best-effort pass, preserve the rest of the finalized
            // wiki instead of failing the complete run.
            continue;
        }
        const initial = initialConcepts.get(page);
        const bodyChanged = initial === undefined || initial.bodyHash !== hashConceptBody(content);
        const pageProducerActor = producerActorsByPage?.get(page) ?? producerActor;
        const candidate = bodyChanged
            ? canonicalizeChangedConcept(removeFrontmatterField(setGeneratedEvent(content, pageProducerActor, now), "timestamp"))
            : restoreGeneratedEvent(content, initial.generated);
        const reconciled = repairOkfFrontmatter(candidate, page).content;
        if (reconciled !== content) {
            const result = await backend.write(page, reconciled);
            // A provenance write is useful but not essential page content. The
            // deterministic fallback is the already-persisted unstamped/stale page;
            // later finalizers can still synchronize Claims against those bytes.
            if (result.error)
                continue;
        }
    }
}
/**
 * Applies OpenWiki's minimal byte-level format to a concept changed this run.
 *
 * Only terminal line endings are canonicalized. Prose wrapping, indentation,
 * tables, and every other producer-authored Markdown choice remain untouched.
 * Existing no-op pages never pass through this function, preserving their
 * bytes exactly.
 *
 * @param content - Changed or newly created concept content.
 * @returns Content ending in exactly one LF line ending.
 */
function canonicalizeChangedConcept(content) {
    return `${content.replace(/[\r\n]*$/u, "")}\n`;
}
/**
 * Reads one required concept as UTF-8-compatible text.
 *
 * @param backend - Active wiki filesystem abstraction.
 * @param filePath - Virtual concept path to read.
 * @returns Complete persisted concept content.
 */
async function readRequiredContent(backend, filePath) {
    const read = await backend.readRaw(filePath);
    const content = read.data?.content;
    if (read.error || content === undefined || content instanceof Uint8Array) {
        throw new Error(`Unable to read concept ${filePath}: ${read.error ?? "not text"}`);
    }
    return Array.isArray(content) ? content.join("\n") : content;
}
/**
 * Hashes the exact Markdown body while excluding front matter. Whitespace is
 * retained so any body change advances the generated event.
 *
 * @param content - Complete concept document.
 * @returns Stable SHA-256 body fingerprint.
 */
function hashConceptBody(content) {
    const body = splitFrontmatter(content).body;
    return createHash("sha256").update(body).digest("hex");
}
/**
 * Reads a valid producer event from a page's front matter.
 *
 * @param content - Complete concept document.
 * @returns Parsed producer event, or `undefined` when absent or invalid.
 */
function readGeneratedEvent(content) {
    const value = parseFrontmatterFields(content)?.generated;
    if (!isRecord(value) ||
        typeof value.by !== "string" ||
        value.by.trim().length === 0 ||
        (value.at !== undefined &&
            (typeof value.at !== "string" || value.at.trim().length === 0))) {
        return undefined;
    }
    return {
        by: value.by,
        ...(typeof value.at === "string" ? { at: value.at } : {}),
    };
}
/**
 * Restores the pre-run producer event without advancing its timestamp.
 *
 * @param content - Final concept document.
 * @param generated - Valid pre-run producer event, when one existed.
 * @returns Content with the code-owned field restored or removed.
 */
function restoreGeneratedEvent(content, generated) {
    if (generated && sameGeneratedEvent(readGeneratedEvent(content), generated)) {
        return content;
    }
    return generated
        ? setGeneratedEvent(content, generated.by, generated.at)
        : removeFrontmatterField(content, "generated");
}
/**
 * Compares two valid producer events by meaning rather than YAML formatting.
 */
function sameGeneratedEvent(left, right) {
    return left?.by === right.by && left.at === right.at;
}
/**
 * Narrows an unknown value to a non-array object record.
 *
 * @param value - Unknown candidate value.
 * @returns Whether the value is a record.
 */
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
