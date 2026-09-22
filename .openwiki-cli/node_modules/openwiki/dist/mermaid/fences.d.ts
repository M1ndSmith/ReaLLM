/**
 * A single fenced ```mermaid block located inside a Markdown document.
 */
export interface MermaidFence {
    /**
     * Zero-based line index of the opening ```mermaid line.
     */
    openLine: number;
    /**
     * Zero-based line index of the closing ``` line.
     */
    closeLine: number;
    /**
     * Leading whitespace of the opening fence line, preserved on rewrite.
     */
    indent: string;
    /**
     * The backtick run that opened the fence (``` or longer).
     */
    marker: string;
    /**
     * Diagram text between the fence lines, excluding the fence lines themselves.
     */
    body: string;
}
/**
 * Extracts every ```mermaid fence from a Markdown document.
 *
 * Generic fenced blocks are tracked so a ```mermaid example nested inside a
 * longer ````markdown fence is ignored, and indentation is preserved so fences
 * inside list items round-trip correctly on rewrite.
 */
export declare function extractMermaidFences(markdown: string): MermaidFence[];
