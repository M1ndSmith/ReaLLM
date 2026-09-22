/**
 * Removes HTML tags from a string and returns the remaining plain text.
 *
 * Well-formed tags are removed by stripping `<...>` spans repeatedly until the
 * string stops changing. Any leftover angle brackets are then removed individually,
 * so neither a complete nor a partial tag can survive.
 */
export declare function stripHtmlTags(input: string): string;
/**
 * Removes terminal control protocols from untrusted text before rendering it.
 * Newlines and tabs remain useful Markdown whitespace; other C0/C1 controls
 * are discarded rather than passed to a terminal emulator.
 */
export declare function stripTerminalControlSequences(input: string): string;
