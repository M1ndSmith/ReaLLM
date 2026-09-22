/**
 * Atomically replaces one UTF-8 text file while preserving existing mode bits.
 *
 * @param filePath - Absolute destination path.
 * @param content - Complete replacement content.
 */
export declare function writeTextAtomic(filePath: string, content: string): Promise<void>;
