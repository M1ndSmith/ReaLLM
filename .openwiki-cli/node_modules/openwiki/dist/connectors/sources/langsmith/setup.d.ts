/**
 * LangSmith workspace region. Maps to the three official API hosts the connector
 * is allowlisted to talk to; the wizard offers this instead of a raw URL.
 */
export type LangSmithRegion = "us" | "eu" | "apac";
/**
 * One workspace as the wizard edits it: a region, the env var naming its key, and
 * the project names.
 */
export interface LangSmithWorkspaceSetup {
    /**
     * Workspace region derived from the committed apiBaseUrl (US when unset).
     */
    region: LangSmithRegion;
    /**
     * Env var name holding this workspace's API key.
     */
    apiKeyEnv: string;
    /**
     * Configured project names, in file order.
     */
    projects: string[];
}
/**
 * Reads the committed workspaces so the wizard can seed its fields. Returns an
 * empty list when the repo has no config.
 */
export declare function loadLangSmithSetup(repoRoot: string): Promise<LangSmithWorkspaceSetup[]>;
/**
 * Writes the committed config so its workspaces are exactly `workspaces` (project
 * names trimmed, deduped, order preserved; region -> apiBaseUrl). WYSIWYG: a
 * workspace with no projects is dropped (which also removes it), and switching a
 * workspace back to US drops its apiBaseUrl. A no-op when there is nothing to
 * write and no existing file, so an untouched setup never creates one.
 */
export declare function saveLangSmithSetup(repoRoot: string, workspaces: LangSmithWorkspaceSetup[]): Promise<void>;
/**
 * The first unused workspace key env var name given the ones already assigned, so
 * each workspace gets a distinct OPENWIKI_LANGSMITH_API_KEY(_n).
 */
export declare function nextLangSmithApiKeyEnv(existing: string[]): string;
