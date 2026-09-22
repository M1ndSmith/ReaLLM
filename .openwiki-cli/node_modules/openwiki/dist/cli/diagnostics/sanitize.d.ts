/**
 * Collapses a value to a single-line, control-character-free string that is
 * safe to print in a terminal header, truncating with an ellipsis past
 * `maxLength`. Strips control characters first (so an escape sequence in an
 * untrusted value cannot rewrite the line), then folds any remaining
 * whitespace runs to single spaces.
 *
 * @param maxLength - Maximum rendered length before an ellipsis is appended.
 *
 * @default 80 - the header width the CLI renders at.
 */
export declare function sanitizeHeaderValue(value: string, maxLength?: number): string;
/**
 * Replaces every C0/C1 control character (and any code point that cannot be
 * read) with a space, leaving printable text intact. Prevents terminal escape
 * sequences embedded in untrusted values from moving the cursor or rewriting
 * output when the value is displayed.
 */
export declare function stripControlCharacters(value: string): string;
