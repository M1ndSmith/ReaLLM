/**
 * Localized labels for the two deterministic index sections that the OKF index
 * sync renders in every directory's `index.md`.
 */
export interface IndexLabels {
    /**
     * Heading for the list of concept pages in a directory (English "Files").
     */
    files: string;
    /**
     * Heading for the list of subdirectories in a directory (English
     * "Directories").
     */
    directories: string;
}
/**
 * Built-in English labels, used as the structural default whenever a wiki's
 * language is English or has no localized entry in the map below.
 */
export declare const ENGLISH_INDEX_LABELS: IndexLabels;
/**
 * Resolves the index section headings for a wiki language.
 *
 * Tries the full canonical tag, then its primary subtag, then falls back to the
 * built-in English labels, so an unlisted or malformed language degrades to
 * English structural headings rather than failing. For example `pt-BR` resolves
 * to the `pt` default while `pt-PT` uses its own override.
 */
export declare function resolveIndexLabels(language: string | undefined): IndexLabels;
/**
 * Built-in English fallback for the concept `type` the code derives when a page
 * has missing or malformed OKF front matter.
 */
export declare const ENGLISH_CONCEPT_TYPE = "Reference";
/**
 * Resolves the derived concept `type` label for a wiki language.
 *
 * Uses the same full-tag then primary-subtag then English resolution as
 * `resolveIndexLabels`, so an unlisted or malformed language degrades to the
 * English "Reference" rather than failing.
 */
export declare function resolveConceptTypeLabel(language: string | undefined): string;
