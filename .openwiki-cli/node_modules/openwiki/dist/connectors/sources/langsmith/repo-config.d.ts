import type { LangSmithProjectConfig } from "./types.js";
/**
 * One LangSmith workspace in the committed config: a region (via apiBaseUrl), the
 * env var naming its API key, and the projects to document there. A LangSmith key
 * is workspace- and region-bound, so cross-region documentation needs one entry
 * per workspace, each with its own key.
 */
export interface LangSmithWorkspaceConfig {
    /**
     * Env var name holding this workspace's API key. The key itself is never
     * committed; only the name lives in the file.
     */
    apiKeyEnv: string;
    /**
     * Projects to document in this workspace. One entry = one source.
     */
    projects: LangSmithProjectConfig[];
    /**
     * Non-default API host for EU workspaces.
     *
     * @default the connector's default host (https://api.smith.langchain.com)
     */
    apiBaseUrl?: string;
}
/**
 * The repo-committed LangSmith config. Committed so CI and every teammate
 * document the same set of workspaces and projects.
 */
export interface LangSmithRepoConfig {
    /**
     * Configured workspaces. One entry per LangSmith workspace/region.
     */
    workspaces: LangSmithWorkspaceConfig[];
}
/**
 * Absolute path of the committed LangSmith config for a repository.
 */
export declare function getLangSmithRepoConfigPath(repoRoot: string): string;
/**
 * Returns a normalized apiBaseUrl only when it is an https URL, carries no
 * embedded credentials, and targets an official LangSmith host; otherwise
 * undefined so callers fall back to the default host. Because the base URL
 * receives the user's API key, an unvalidated value from a repo-committed config
 * would let a malicious PR exfiltrate the key or drive SSRF to an internal host.
 */
export declare function sanitizeLangSmithApiBaseUrl(value: unknown): string | undefined;
/**
 * Returns the env var name only when it is inside the OpenWiki LangSmith
 * namespace; otherwise undefined so the workspace is dropped. Guards against a
 * committed config naming an unrelated secret as the key to send to LangSmith.
 */
export declare function sanitizeLangSmithApiKeyEnv(value: unknown): string | undefined;
/**
 * Reads and validates the committed config, or returns undefined when the file
 * is absent or malformed. Only named keys are read, so unexpected or
 * prototype-polluting keys never take effect.
 */
export declare function readLangSmithRepoConfig(repoRoot: string): Promise<LangSmithRepoConfig | undefined>;
/**
 * Parses config text into a LangSmithRepoConfig, or undefined when invalid. Each
 * workspace must carry an allowlisted apiKeyEnv and well-formed projects; any
 * workspace failing an allowlist (apiKeyEnv or apiBaseUrl) or shape check is
 * dropped rather than failing the whole config.
 */
export declare function parseLangSmithRepoConfig(text: string | undefined): LangSmithRepoConfig | undefined;
/**
 * Writes the committed config, creating openwiki/ if needed. Mirrors
 * saveRepositoryWikiInstructions: a plain write to a fixed path under the repo's
 * openwiki/ directory, so containment holds by construction.
 */
export declare function writeLangSmithRepoConfig(repoRoot: string, config: LangSmithRepoConfig): Promise<void>;
