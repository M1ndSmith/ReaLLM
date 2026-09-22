/**
 * Parses a tool input that may arrive as stringified JSON.
 */
export declare function parseToolInput(input: unknown): unknown;
/**
 * Counts targets stored directly or under the first matching input key.
 */
export declare function countToolTargets(input: unknown, keys: string[]): number;
