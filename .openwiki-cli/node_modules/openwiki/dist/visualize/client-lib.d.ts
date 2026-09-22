import type { WikiGraph } from "./graph.js";
/**
 * The minimal node shape the search/type filter needs. Both the raw wiki nodes
 * from /api/graph and the force-graph render objects satisfy it structurally.
 */
export interface FilterableNode {
    /**
     * Stable page id (path relative to the wiki root, without .md).
     */
    id: string;
    /**
     * Display title.
     */
    title: string;
    /**
     * Page kind, matched against the active type filter.
     */
    type: string;
    /**
     * Topic tags, folded into the free-text search haystack.
     *
     * @default undefined - treated as no tags.
     */
    tags?: readonly string[];
}
/**
 * Node sphere colors, keyed by draw order. Saturated enough to hold their hue as
 * lit 3D spheres (pale pastels blow out to white under the scene lighting); the
 * legend swatches reuse these same values.
 */
export declare const PALETTE: readonly string[];
/**
 * Escape the HTML-significant characters in a string before it is inserted into
 * the DOM. This is the sole XSS gate for wiki-sourced text.
 */
export declare function escapeHtml(value: string): string;
/**
 * Map each distinct node type to a palette color by its position in the list, so
 * the graph and legend agree on colors and they stay stable across reloads.
 */
export declare function colorsForTypes(types: readonly string[], palette?: readonly string[]): Record<string, string>;
/**
 * Convert a `#RRGGBB` hex color plus an alpha into an `rgba(...)` string, for
 * canvas glow fills and dimming. A non-6-digit input is returned unchanged.
 */
export declare function hexA(hex: string, alpha: number): string;
/**
 * Node circle radius in graph units, scaled by page length and capped, with a
 * bonus for the entry (anchor) page so it reads as the starting point.
 */
export declare function nodeRadius(size: number, isAnchor: boolean): number;
/**
 * Interaction context used to decide whether a node label should be painted on
 * the graph canvas.
 */
export interface NodeLabelContext {
    /**
     * The selected page id, or null when the user has not selected a graph node.
     */
    selectedId: string | null;
    /**
     * The hovered page id, or null when no graph node is under the pointer.
     */
    hoveredId: string | null;
    /**
     * Whether this node is part of the selected node's immediate neighbourhood.
     */
    isInSelectedNeighborhood: boolean;
}
/**
 * Keep graph labels contextual: hover reveals only the hovered node, while a
 * selected node reveals itself plus its immediate neighbours.
 */
export declare function shouldShowNodeLabel(node: Pick<FilterableNode, "id">, context: NodeLabelContext): boolean;
/**
 * Whether a node survives the active search text and type filter. An empty query
 * or empty type matches everything.
 */
export declare function matchesFilter(node: FilterableNode, query: string, type: string): boolean;
/**
 * A stable fingerprint of the graph's topology (its node ids and directed edges).
 * When it is unchanged across a reload, the scene can be left untouched so the
 * layout and viewport do not snap.
 */
export declare function signature(graph: Pick<WikiGraph, "nodes" | "edges">): string;
/**
 * Strip a leading YAML frontmatter block from a markdown body before it is
 * rendered in the reader. A body without frontmatter is returned unchanged.
 */
export declare function stripFrontmatter(body: string): string;
/**
 * Resolve a relative link (`rel`) against a page's directory (`baseDir`) into a
 * normalized wiki path, collapsing `.` and `..` segments. Used to turn in-page
 * markdown links into node ids for in-app navigation.
 */
export declare function normalize(baseDir: string, rel: string): string;
