import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { marked } from "marked";
import { stripHtmlTags, stripTerminalControlSequences, } from "../../platform/utils.js";
/**
 * Renders a markdown string as a column of Ink blocks by lexing it with marked
 * (GFM, synchronous) and delegating each top-level token to MarkdownBlock.
 */
export function MarkdownText({ markdown }) {
    const tokens = marked.lexer(stripTerminalControlSequences(markdown), {
        async: false,
        gfm: true,
    });
    return (_jsx(Box, { flexDirection: "column", children: tokens.map((token, index) => (_jsx(MarkdownBlock, { index: index, token: token }, `${token.type}-${index}`))) }));
}
/**
 * Renders a single block-level markdown token (paragraph, heading, list, code,
 * blockquote, table, html, or text), returning null for structural whitespace.
 */
export function MarkdownBlock({ index, token, }) {
    if (token.type === "space" || token.type === "def" || token.type === "hr") {
        return null;
    }
    if (token.type === "paragraph") {
        return (_jsx(Text, { wrap: "wrap", children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "heading") {
        return (_jsx(Text, { wrap: "wrap", children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "list") {
        return (_jsx(Box, { flexDirection: "column", children: token.items.map((item, itemIndex) => (_jsxs(Text, { wrap: "wrap", children: [_jsx(Text, { color: "gray", children: token.ordered
                            ? `${Number(token.start || 1) + itemIndex}. `
                            : "- " }), _jsx(InlineMarkdown, { tokens: getTokenChildren(item) })] }, `${index}-${itemIndex}`))) }));
    }
    if (token.type === "code") {
        return _jsx(Text, { color: "gray", children: token.text });
    }
    if (token.type === "blockquote") {
        return (_jsxs(Text, { wrap: "wrap", children: [_jsx(Text, { color: "gray", children: "| " }), _jsx(InlineMarkdown, { tokens: getTokenChildren(token) })] }));
    }
    if (token.type === "table") {
        return _jsx(Text, { color: "gray", children: renderPlainTable(token) });
    }
    if (token.type === "html") {
        return _jsx(Text, { wrap: "wrap", children: renderHtmlToken(token) });
    }
    if (token.type === "text") {
        return (_jsx(Text, { wrap: "wrap", children: _jsx(InlineMarkdown, { tokens: token.tokens ?? [token] }) }));
    }
    return _jsx(Text, { wrap: "wrap", children: token.raw });
}
/**
 * Renders a sequence of inline markdown tokens.
 */
export function InlineMarkdown({ tokens }) {
    return (_jsx(_Fragment, { children: tokens.map((token, index) => (_jsx(InlineMarkdownToken, { token: token }, `${token.type}-${index}`))) }));
}
/**
 * Renders a single inline markdown token (text, strong, em, link, codespan,
 * br, del, or html), recursing into children for the styled variants.
 */
export function InlineMarkdownToken({ token }) {
    if (token.type === "text" || token.type === "escape") {
        return _jsx(_Fragment, { children: token.text });
    }
    if (token.type === "strong") {
        return (_jsx(Text, { bold: true, children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "em") {
        return (_jsx(Text, { italic: true, children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "link") {
        return (_jsx(Text, { underline: true, children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "codespan") {
        return _jsx(Text, { color: "gray", children: token.text });
    }
    if (token.type === "br") {
        return _jsx(_Fragment, { children: "\n" });
    }
    if (token.type === "del") {
        return (_jsx(Text, { strikethrough: true, children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "html") {
        return _jsx(_Fragment, { children: renderHtmlToken(token) });
    }
    if ("tokens" in token && Array.isArray(token.tokens)) {
        return _jsx(InlineMarkdown, { tokens: token.tokens });
    }
    return _jsx(_Fragment, { children: token.raw });
}
/**
 * Returns a token's child tokens, or an empty array when it has none.
 */
export function getTokenChildren(token) {
    return "tokens" in token && Array.isArray(token.tokens) ? token.tokens : [];
}
/**
 * Flattens a markdown table token into pipe-delimited plain-text rows.
 */
export function renderPlainTable(token) {
    const header = token.header.map((cell) => cell.text).join(" | ");
    const rows = token.rows.map((row) => row.map((cell) => cell.text).join(" | "));
    return [header, ...rows].filter(Boolean).join("\n");
}
/**
 * Renders an inline HTML token as underlined text for a `<u>` wrapper, otherwise
 * strips tags to plain text so no raw HTML reaches the terminal.
 */
export function renderHtmlToken(token) {
    const text = "text" in token && typeof token.text === "string" ? token.text : token.raw;
    const underlineMatch = text.match(/^<u>(.*)<\/u>$/isu);
    if (underlineMatch) {
        return _jsx(Text, { underline: true, children: underlineMatch[1] });
    }
    return stripHtmlTags(text);
}
