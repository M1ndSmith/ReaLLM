/**
 * Shared helpers for classifying Node.js filesystem errors.
 *
 * These were previously duplicated verbatim across several modules. Keeping a
 * single source of truth avoids drift when the set of tolerated error codes
 * changes.
 */
/**
 * True when the error is a "file or directory does not exist" (ENOENT) error.
 */
export declare function isFileNotFoundError(error: unknown): boolean;
/**
 * True when the error is one that can normally occur if a file or directory
 * changes shape while a directory tree is being scanned (removed, replaced by a
 * directory, or replaced by a non-directory). Callers treat these as "skip this
 * entry" rather than as fatal.
 */
export declare function isExpectedSnapshotRaceError(error: unknown): boolean;
