import React from "react";
import { type Token, type Tokens } from "marked";
/**
 * Renders a markdown string as a column of Ink blocks by lexing it with marked
 * (GFM, synchronous) and delegating each top-level token to MarkdownBlock.
 */
export declare function MarkdownText({ markdown }: {
    markdown: string;
}): React.JSX.Element;
/**
 * Renders a single block-level markdown token (paragraph, heading, list, code,
 * blockquote, table, html, or text), returning null for structural whitespace.
 */
export declare function MarkdownBlock({ index, token, }: {
    index: number;
    token: Token;
}): React.JSX.Element | null;
/**
 * Renders a sequence of inline markdown tokens.
 */
export declare function InlineMarkdown({ tokens }: {
    tokens: Token[];
}): React.JSX.Element;
/**
 * Renders a single inline markdown token (text, strong, em, link, codespan,
 * br, del, or html), recursing into children for the styled variants.
 */
export declare function InlineMarkdownToken({ token }: {
    token: Token;
}): React.JSX.Element;
/**
 * Returns a token's child tokens, or an empty array when it has none.
 */
export declare function getTokenChildren(token: Token): Token[];
/**
 * Flattens a markdown table token into pipe-delimited plain-text rows.
 */
export declare function renderPlainTable(token: Tokens.Table): string;
/**
 * Renders an inline HTML token as underlined text for a `<u>` wrapper, otherwise
 * strips tags to plain text so no raw HTML reaches the terminal.
 */
export declare function renderHtmlToken(token: Token): React.ReactNode;
