import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
/**
 * A titled section: a `#`-prefixed cyan header above left-indented children.
 */
export function Panel({ title, children }) {
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: "cyan", children: "# " }), _jsx(Text, { bold: true, children: title })] }), _jsx(Box, { flexDirection: "column", marginLeft: 2, children: children })] }));
}
/**
 * Renders label/description pairs with the labels padded to a common width.
 */
export function Rows({ rows }) {
    const labelWidth = Math.max(...rows.map((row) => row.label.length));
    return (_jsx(_Fragment, { children: rows.map((row) => (_jsxs(Text, { children: ["  ", row.label.padEnd(labelWidth), "  ", row.description] }, row.label))) }));
}
/**
 * A single `* label value` line colored by tone (green/red/yellow/gray).
 */
export function StatusLine({ tone, label, value }) {
    const color = tone === "success"
        ? "green"
        : tone === "error"
            ? "red"
            : tone === "active"
                ? "yellow"
                : "gray";
    return (_jsxs(Text, { children: [_jsx(Text, { color: color, children: "* " }), _jsx(Text, { bold: true, color: color, children: label }), " ", _jsx(Text, { color: tone === "muted" ? "gray" : undefined, children: value })] }));
}
/**
 * A slash-menu row: a `>` marker plus padded label and gray description, bolded
 * and cyan when selected.
 */
export function MenuRow({ description, isSelected, label }) {
    return (_jsxs(Text, { children: [_jsx(Text, { color: isSelected ? "cyan" : "gray", children: isSelected ? ">" : " " }), " ", _jsx(Text, { bold: isSelected, children: label.padEnd(28) }), _jsx(Text, { color: "gray", children: description })] }));
}
/**
 * The blinking-style text-input caret glyph.
 */
export function InputCursor() {
    return _jsx(Text, { color: "cyan", children: "|" });
}
/**
 * Echoes a submitted user message in a gray-backgrounded `>`-prefixed block.
 */
export function PromptBlock({ message }) {
    return (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: _jsxs(Text, { backgroundColor: "gray", wrap: "wrap", children: [" ", _jsx(Text, { color: "cyan", children: ">" }), " ", message] }) }));
}
