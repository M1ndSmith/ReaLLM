import { type MermaidFence } from "./fences.js";
/**
 * A mermaid fence that failed to parse, paired with its sanitized error.
 */
export interface MermaidFenceError {
    /**
     * The fence whose body Mermaid rejected.
     */
    fence: MermaidFence;
    /**
     * The parser error, secret-redacted and made HTML-comment-safe.
     */
    error: string;
}
/**
 * The result of degrading the invalid fences in a single document.
 */
export interface MermaidDegradeResult {
    /**
     * The rewritten document, identical to the input when nothing degraded.
     */
    content: string;
    /**
     * How many fences were degraded to text fences.
     */
    degraded: number;
}
/**
 * The subset of the Mermaid API this module depends on.
 */
interface MermaidApi {
    /**
     * Parses diagram text and rejects when it is not renderable.
     */
    parse: (text: string) => Promise<unknown>;
}
/**
 * Loads the Mermaid parser after installing DOM globals, or resolves to
 * `undefined` when mermaid/jsdom are not installed.
 *
 * `mermaid` and `jsdom` are optional peer dependencies. When present, callers
 * get the authoritative parser; when absent, they get `undefined` and fall back
 * to `heuristicError`. The import is lazy and memoized so a wiki with no
 * diagrams never pulls them in, and mermaid must not be imported anywhere else,
 * or it may evaluate before the DOM shim runs.
 */
export declare function loadMermaid(): Promise<MermaidApi | undefined>;
/**
 * Parses every mermaid fence in a document and returns the failures.
 *
 * Uses the authoritative mermaid parser when it is installed, otherwise a
 * conservative heuristic that only flags near-certain breakages.
 */
export declare function findInvalidMermaidFences(markdown: string): Promise<MermaidFenceError[]>;
/**
 * Best-effort syntax check used when the mermaid parser is not installed.
 *
 * Deliberately conservative: it only flags breakages that are near-certain, so
 * a valid diagram is never degraded. It therefore misses errors the real parser
 * would catch; install `mermaid` (for example in CI) for authoritative
 * validation. Returns a short reason when the diagram is very likely broken.
 *
 * Exported for unit testing; production callers reach it via
 * `findInvalidMermaidFences`.
 */
export declare function heuristicError(body: string): string | undefined;
/**
 * Degrades invalid mermaid fences to plain ```text fences so content survives
 * and no broken diagram block reaches a renderer.
 *
 * Each degraded fence is preceded by an HTML comment carrying the parser error,
 * so a later update run can find it inline and repair the diagram. Returns the
 * input unchanged when every fence parses.
 */
export declare function degradeInvalidMermaidFences(markdown: string): Promise<MermaidDegradeResult>;
/**
 * Makes a thrown Mermaid parser error safe to embed in a wiki HTML comment.
 *
 * The error first passes through `sanitizeDiagnosticText`, the codebase's
 * secret-redaction boundary. It is then flattened to one line, keeping the
 * meaningful lines (the location and the `Expecting ... got ...` diagnosis) and
 * dropping only the caret-underline noise, since that diagnosis is what lets a
 * later run actually repair the diagram. Finally `--` (which would terminate an
 * HTML comment) is collapsed and the result is length-capped.
 *
 * Exported for unit testing; production callers reach it via
 * `findInvalidMermaidFences`.
 */
export declare function sanitizeMermaidError(error: unknown): string;
export {};
