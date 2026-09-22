import type { Key } from "ink";
import type { ChatInputState } from "./types.js";
/**
 * Moves the caret by `offset` characters, clamped to the bounds of the value.
 */
export declare function moveInputCursor(state: ChatInputState, offset: number): ChatInputState;
/**
 * Deletes the character immediately before the caret (backspace), leaving the
 * caret one position to the left.
 */
export declare function deleteBeforeInputCursor(state: ChatInputState): ChatInputState;
/**
 * Deletes the character at the caret (forward delete), leaving the caret in
 * place.
 */
export declare function deleteAtInputCursor(state: ChatInputState): ChatInputState;
/**
 * Applies a raw terminal input chunk to the input state, interpreting embedded
 * ANSI escapes for cursor movement (left/right), forward delete, and backspace,
 * ignoring vertical-arrow escapes, and inserting any remaining printable
 * characters while dropping control characters.
 */
export declare function applyRawInputValue(state: ChatInputState, inputValue: string): ChatInputState;
/**
 * Inserts `character` at the caret and advances the caret past it.
 */
export declare function insertAtInputCursor(state: ChatInputState, character: string): ChatInputState;
/**
 * Clamps a caret position into `[0, value.length]`.
 */
export declare function clampCursorPosition(position: number, value: string): number;
/**
 * Reports whether `character` is a C0 control character (code point below 32),
 * so raw input parsing can drop it rather than insert it.
 */
export declare function isControlCharacter(character: string): boolean;
/**
 * Reports whether a raw input chunk is a bare backspace/delete keystroke.
 */
export declare function isRawBackspaceInput(inputValue: string): boolean;
/**
 * Reports whether a keystroke is Escape, from either the parsed `key` flag or a
 * raw ESC input byte.
 */
export declare function isEscapeInput(inputValue: string, key: Key): boolean;
