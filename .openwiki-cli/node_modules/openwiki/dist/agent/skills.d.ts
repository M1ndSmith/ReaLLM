/** Copies bundled skills into the OpenWiki home while preserving other skills. */
export declare function syncBundledSkills(): Promise<void>;
/** Replaces bundled skill directories without removing unrelated skills. */
export declare function replaceSkillDirectories(sourceDir: string, targetDir: string): Promise<void>;
