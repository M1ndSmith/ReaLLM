import React from "react";
import type { HelpRow } from "../commands.js";
/**
 * Props for a titled, indented content block.
 */
interface PanelProps {
    title: string;
    children: React.ReactNode;
}
/**
 * A titled section: a `#`-prefixed cyan header above left-indented children.
 */
export declare function Panel({ title, children }: PanelProps): React.JSX.Element;
/**
 * Props for a label/description table.
 */
interface RowsProps {
    rows: HelpRow[];
}
/**
 * Renders label/description pairs with the labels padded to a common width.
 */
export declare function Rows({ rows }: RowsProps): React.JSX.Element;
/**
 * Props for a single tone-colored status line.
 */
interface StatusLineProps {
    tone: "active" | "error" | "muted" | "success";
    label: string;
    value: string;
}
/**
 * A single `* label value` line colored by tone (green/red/yellow/gray).
 */
export declare function StatusLine({ tone, label, value }: StatusLineProps): React.JSX.Element;
/**
 * Props for a single selectable menu row.
 */
interface MenuRowProps {
    description: string;
    isSelected: boolean;
    label: string;
}
/**
 * A slash-menu row: a `>` marker plus padded label and gray description, bolded
 * and cyan when selected.
 */
export declare function MenuRow({ description, isSelected, label }: MenuRowProps): React.JSX.Element;
/**
 * The blinking-style text-input caret glyph.
 */
export declare function InputCursor(): React.JSX.Element;
/**
 * Props for an echoed user prompt block.
 */
interface PromptBlockProps {
    message: string;
}
/**
 * Echoes a submitted user message in a gray-backgrounded `>`-prefixed block.
 */
export declare function PromptBlock({ message }: PromptBlockProps): React.JSX.Element;
export {};
