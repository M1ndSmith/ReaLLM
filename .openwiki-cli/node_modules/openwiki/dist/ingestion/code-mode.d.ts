import type { OpenWikiRunEvent } from "../agent/types.js";
/** Controls which parts of the repo OpenWiki sets up for code mode. */
export interface CodeModeRepoSetupOptions {
    /**
     * Write the scheduled-update workflow file. Only `openwiki code --init`
     * should create it; `--update` and chat runs leave an existing file alone so
     * operator customizations (fork guards, pinned actions, custom steps) are
     * never silently overwritten.
     */
    createWorkflow?: boolean;
    /** Cron expression for a freshly created workflow. Defaults to {@link DEFAULT_CODE_MODE_CRON}. */
    cronExpression?: string;
    /**
     * Environment the generated workflow's provider block is derived from.
     * Defaults to `process.env`, which by this point holds the credentials setup
     * resolved for this run.
     */
    env?: NodeJS.ProcessEnv;
}
/**
 * Ensure the repo is set up for code mode: refresh the managed agent-instruction
 * snippets, and, when `options.createWorkflow` is set, create the scheduled-update
 * workflow if it does not already exist.
 */
export declare function ensureCodeModeRepoSetup(cwd: string, options?: CodeModeRepoSetupOptions): Promise<void>;
/**
 * Runs every configured code-mode connector for a code-mode agent run and appends
 * their guidance to the agent's message. Returns the base message unchanged when
 * nothing contributes, so an unconfigured repo still noop-skips. Fail-open: a
 * connector that throws is skipped, never allowed to break the update.
 */
export declare function runCodeModeConnectors(repoRoot: string, baseMessage: string | undefined, onEvent?: (event: OpenWikiRunEvent) => void): Promise<string | undefined>;
