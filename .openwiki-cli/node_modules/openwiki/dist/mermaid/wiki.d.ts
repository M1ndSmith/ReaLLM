import type { BackendProtocolV2 } from "deepagents";
import type { OpenWikiOutputMode } from "../agent/types.js";
/**
 * Summary of one mermaid validation pass over a generated wiki.
 */
export interface WikiMermaidReport {
    /**
     * How many Markdown files were scanned.
     */
    filesScanned: number;
    /**
     * How many mermaid fences were found across all scanned files.
     */
    fencesChecked: number;
    /**
     * How many fences were degraded to text fences.
     */
    fencesDegraded: number;
    /**
     * Wiki-root-relative paths of files that were rewritten.
     */
    repairedFiles: string[];
}
/**
 * Validates every mermaid fence in a generated wiki and degrades the invalid
 * ones in place.
 *
 * Walks the wiki through the backend virtual filesystem so writes stay inside
 * the docs-only boundary and both output modes work (`local-wiki` rooted at `/`,
 * `code` rooted at `/openwiki`). Files with no failing fences are left byte-for-
 * byte unchanged, so this creates no diff noise.
 */
export declare function validateWikiMermaid(backend: BackendProtocolV2, outputMode: OpenWikiOutputMode): Promise<WikiMermaidReport>;
