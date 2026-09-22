import type { BackendProtocolV2 } from "deepagents";
/**
 * Extension field flagging front matter OpenWiki derived deterministically.
 */
export declare const OPENWIKI_GENERATED_FIELD = "openwiki_generated";
/**
 * Extension field marking a page whose translation is still owed, carrying the
 * BCP-47 target language (for example `"zh-CN"`). Written and cleared only by the
 * translation middleware; the deterministic OKF pass merely preserves it.
 */
export declare const OPENWIKI_TRANSLATION_PENDING_FIELD = "openwiki_translation_pending";
/**
 * Minimal OKF fields OpenWiki can derive from a page body. Only `type` (the sole
 * required OKF field) and a `title` are derived; the optional `description` is
 * left for the agent to supply, since a code-guessed one is usually poor.
 */
interface DerivedFrontmatter {
    /**
     * Concept title from the first H1, falling back to the filename.
     */
    title: string;
    /**
     * OKF concept type; defaults to "Reference" for derived pages.
     */
    type: string;
}
/**
 * A single structured problem found while validating front matter.
 */
export interface FrontmatterIssue {
    /**
     * Stable machine-readable issue code.
     */
    code: string;
    /**
     * 1-based line number the issue points at, when known.
     */
    line?: number;
    /**
     * Human-readable explanation of the problem.
     */
    message: string;
}
/**
 * Result of validating a Markdown file's OKF front matter.
 */
export type FrontmatterValidation = {
    valid: true;
} | {
    valid: false;
    issues: FrontmatterIssue[];
};
/** Result of deterministically repairing one Markdown concept in memory. */
export interface FrontmatterRepair {
    /** Whether the returned Markdown differs from the input. */
    changed: boolean;
    /** Repaired Markdown, including the original authored body. */
    content: string;
}
/** Result of repairing and re-validating one persisted Markdown concept. */
export interface PersistedFrontmatterRepair {
    /** Whether a repaired version was written. */
    changed: boolean;
    /** Validation of the final bytes that could be read from storage. */
    validation: FrontmatterValidation;
}
/**
 * Parses and validates OKF front matter while tolerating producer extensions.
 */
export declare function validateOkfFrontmatter(content: string): FrontmatterValidation;
/**
 * Reads a persisted Markdown file and validates its final front matter.
 */
export declare function validatePersistedFile(backend: BackendProtocolV2, filePath: string): Promise<FrontmatterValidation>;
/**
 * Repairs recognized OKF metadata, persists it only when necessary, and proves
 * the final stored bytes. Read and write failures are returned as structured
 * validation issues because callers choose whether storage is a fatal boundary.
 */
export declare function repairPersistedFile(backend: BackendProtocolV2, filePath: string, conceptType?: string): Promise<PersistedFrontmatterRepair>;
/**
 * Splits a Markdown document into its leading front-matter block and body.
 */
export declare function splitFrontmatter(content: string): {
    block?: string;
    body: string;
};
/**
 * Parses the front-matter block into a field map, or undefined if unusable.
 */
export declare function parseFrontmatterFields(content: string): Record<string, unknown> | undefined;
/**
 * Reads a single front-matter field's string value, or undefined when the field
 * is absent, the block is unparseable, or the value is not a string.
 */
export declare function readFrontmatterField(content: string, key: string): string | undefined;
/**
 * Sets or replaces a single scalar field in a page's front matter, preserving
 * every other line byte-for-byte.
 *
 * This deliberately edits the raw block rather than parsing and re-rendering,
 * because {@link renderFrontmatter} only knows a fixed set of fields and would
 * drop producer extensions on a round trip. When the page has no front-matter
 * block, a minimal one holding just this field is prepended. The value is
 * JSON-quoted so colons and other YAML-significant characters stay safe.
 */
export declare function setFrontmatterField(content: string, key: string, value: string): string;
/**
 * Stamps the code-owned OKF `generated` provenance event on a page (SPEC §5.1),
 * setting or replacing a `generated: { by, at }` flow mapping and preserving
 * every other front-matter line byte-for-byte.
 *
 * `generated` is a mapping, not a scalar, so it cannot go through
 * {@link setFrontmatterField}. The value is emitted as a single-line flow
 * mapping with JSON-quoted members so an actor or datetime containing a colon
 * stays valid YAML. When the page has no front-matter block, a minimal one
 * holding just this field is prepended.
 *
 * `at` is optional so the same helper can carry a bare `{by}` event; callers
 * that record a run time pass it, and it is emitted only when present.
 */
export declare function setGeneratedEvent(content: string, by: string, at?: string): string;
/**
 * Sets the OKF `sources` list while preserving every unrelated front-matter
 * line byte-for-byte.
 *
 * Only the `sources` field is rendered through YAML. This lets deterministic
 * producers safely write nested source mappings without normalizing the rest
 * of a producer-authored front-matter block. An empty list removes the field.
 *
 * @param content - Complete Markdown concept.
 * @param sources - Complete replacement source mappings.
 * @returns Markdown with the requested OKF provenance list.
 */
export declare function setOkfSources(content: string, sources: readonly Record<string, unknown>[]): string;
/**
 * Sets the complete OKF `verified` event list while preserving every unrelated
 * front-matter line byte-for-byte. An empty list removes the field.
 *
 * @param content - Complete Markdown concept.
 * @param events - Complete replacement verification-event mappings.
 * @returns Markdown with the requested trust events.
 */
export declare function setOkfVerified(content: string, events: readonly Record<string, unknown>[]): string;
/**
 * Removes a single field from a page's front matter, preserving every other line
 * byte-for-byte, and returns the content unchanged when the field is absent. If
 * the field was the block's only line, the now-empty block is dropped entirely.
 */
export declare function removeFrontmatterField(content: string, key: string): string;
/**
 * Derives minimal OKF fields from a page body and its path.
 *
 * `conceptType` is the localized fallback stamped as the `type`; it defaults to
 * English "Reference" for callers that do not localize.
 */
export declare function deriveMinimalFrontmatter(body: string, filePath: string, conceptType?: string): DerivedFrontmatter;
/**
 * Renders an OKF front-matter block, flagging code-derived metadata.
 */
export declare function renderFrontmatter(fields: DerivedFrontmatter, options: {
    generated: boolean;
}): string;
/**
 * Guarantees a page has valid OKF front matter without destroying good data.
 *
 * Valid pages are left byte-for-byte unchanged. Invalid recognized fields are
 * repaired or removed conservatively; an unusable YAML block falls back to a
 * minimal derived block tagged `openwiki_generated` for later agent review.
 * Producer extensions survive whenever the original YAML mapping is parseable.
 * Never throws. Returns the new content and whether it changed.
 *
 * `conceptType` is the localized fallback used for a repaired page's `type`; it
 * defaults to English "Reference" for callers that do not localize.
 */
export declare function normalizeConceptContent(content: string, filePath: string, conceptType?: string): {
    changed: boolean;
    content: string;
};
/**
 * Deterministically repairs every recognized OKF field while preserving the
 * authored Markdown body and producer extension fields whenever the YAML map
 * remains parseable.
 *
 * Invalid optional scalar fields are removed, except `title`, which is derived
 * from the first H1 or filename. Invalid list families retain only conformant
 * entries. Trust assertions that cannot be proven conformant are removed rather
 * than rewritten into a false assertion. Missing or invalid `type` receives the
 * localized fallback and marks the metadata as derived.
 *
 * If the YAML mapping itself is unusable, or a raw representation cannot be
 * repaired safely, the deterministic last resort is a minimal valid block. In
 * all cases the returned content passes {@link validateOkfFrontmatter}.
 */
export declare function repairOkfFrontmatter(content: string, filePath: string, conceptType?: string): FrontmatterRepair;
export {};
