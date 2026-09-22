import type { BackendProtocolV2 } from "deepagents";
import type { OpenWikiOutputMode } from "./types.js";
/**
 * One broken internal link found during a validation pass.
 */
export interface WikiLinkIssue {
    /**
     * The link destination exactly as written in the source Markdown.
     */
    href: string;
    /**
     * 1-based line number of the link within its source file.
     */
    line: number;
    /**
     * Human-readable reason the link is broken (missing file, anchor, etc.).
     */
    message: string;
    /**
     * Wiki-absolute path of the file the broken link was found in.
     */
    sourcePath: string;
}
/**
 * Summary of one internal-link validation pass over a generated wiki.
 */
export interface WikiLinkReport {
    /**
     * How many Markdown files were scanned.
     */
    filesScanned: number;
    /**
     * How many relative internal links were checked.
     */
    linksChecked: number;
    /**
     * How many broken links were found (and stamped).
     */
    issuesFound: number;
    /**
     * Wiki-root-relative paths of files that were rewritten with stamps.
     */
    stampedFiles: string[];
}
/**
 * Validates relative wiki links and GitHub-style heading anchors after
 * generation, stamping broken links in place instead of failing the run.
 *
 * Each broken link is preceded by an HTML comment so a later update run can
 * find it inline and repair the href. Existing stamps are cleared first, so a
 * fixed link leaves no residual comment.
 */
export declare function validateWikiInternalLinks(backend: BackendProtocolV2, outputMode: OpenWikiOutputMode): Promise<WikiLinkReport>;
/**
 * Formats link issues into a single actionable diagnostic message.
 */
export declare function formatWikiLinkIssues(issues: WikiLinkIssue[]): string;
/**
 * Builds the HTML comment stamp placed above a broken internal link.
 */
export declare function formatBrokenLinkStamp(href: string, message: string): string;
/**
 * Removes prior broken-link stamps so revalidation starts from clean content.
 */
export declare function stripBrokenLinkStamps(content: string): string;
/**
 * Inserts broken-link stamps above each failing link line (bottom-up).
 */
export declare function stampBrokenLinks(content: string, issues: WikiLinkIssue[]): string;
