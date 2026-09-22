/**
 * Reports whether a submitted chat message is the `/exit` command, ignoring
 * surrounding whitespace and case.
 */
export declare function isExitMessage(message: string): boolean;
/**
 * Formats a count with the appropriate singular or plural noun.
 */
export declare function formatCount(count: number, singular: string, plural: string): string;
/**
 * Abbreviates an absolute path under the home directory to a `~`-prefixed form,
 * leaving other paths unchanged.
 */
export declare function formatCwd(cwd: string): string;
/**
 * Resolves the model id to display, preferring an explicit id, then the model
 * env override, then the configured provider's default.
 */
export declare function getDisplayModelId(modelId: string | null): string;
