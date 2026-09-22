import { OpenWikiIgnore } from "./openwiki-ignore.js";
import type { OpenWikiCommand, OpenWikiOutputMode, OpenWikiRunOptions, RunContext, UpdateRunStatus } from "./types.js";
export type OpenWikiContentSnapshot = string;
export type UpdateNoopStatus = {
    shouldSkip: true;
    gitHead: string;
    model: string;
    /**
     * The wiki's persisted language, carried through so a no-op metadata
     * refresh re-writes `.last-update.json` without dropping it.
     *
     * @default undefined - the previous run recorded no language (a wiki
     * created before language tracking); the refresh omits the field too.
     */
    language?: string;
} | {
    shouldSkip: false;
    reason: string;
};
/**
 * Builds the persisted per-run context used by the prompt.
 */
export declare function createRunContext(cwd: string, outputMode?: OpenWikiOutputMode, language?: string | null): Promise<RunContext>;
/**
 * Decides whether an update can skip its model invocation.
 *
 * An explicit request whose primary language differs from the persisted wiki
 * language is meaningful even on a clean tree, because the translation pass
 * must run before the update agent.
 *
 * Working-tree and committed changes that only touch `openwiki/` or paths
 * excluded by `openWikiIgnore` do not count as meaningful, so an ignored path
 * changing on its own never forces a rebuild.
 *
 * @param cwd - Absolute repository root.
 * @param openWikiIgnore - Active repository read boundary.
 * @param requestedLanguage - Optional output language requested for this run.
 * @returns Skip decision and diagnostic reason.
 */
export declare function getUpdateNoopStatus(cwd: string, openWikiIgnore?: OpenWikiIgnore, requestedLanguage?: string | null): Promise<UpdateNoopStatus>;
export declare function shouldCheckUpdateNoop(options: OpenWikiRunOptions): boolean;
/**
 * Records an init/update run so future updates can diff from this git head.
 * Interrupted runs are recorded with status "interrupted" so the update
 * no-op check knows the wiki may be partial and does not skip the retry.
 * A `null` override deliberately omits the checkpoint when no successful
 * repository baseline exists.
 */
export declare function writeLastUpdateMetadata(command: OpenWikiCommand, cwd: string, modelId: string, outputMode?: OpenWikiOutputMode, status?: UpdateRunStatus, language?: string, gitHeadOverride?: string | null): Promise<void>;
/**
 * Persists run metadata after an update/init run. Always refreshes the
 * `.last-update.json` timestamp so freshness checks reflect the actual last
 * run, even when the wiki content is unchanged (a no-op update still means
 * OpenWiki ran). A completed run also clears any previous interrupted status
 * so the update no-op check can skip again. Returns whether metadata was
 * written (always true for non-chat runs).
 */
export declare function persistRunMetadataIfChanged(command: OpenWikiCommand, cwd: string, modelId: string, outputMode: OpenWikiOutputMode, snapshotBefore: OpenWikiContentSnapshot | null, status?: UpdateRunStatus, language?: string): Promise<boolean>;
/**
 * Hashes OpenWiki content, excluding run metadata, to detect real documentation changes.
 */
export declare function createOpenWikiContentSnapshot(cwd: string, outputMode?: OpenWikiOutputMode): Promise<OpenWikiContentSnapshot>;
/**
 * Exact repository source identity captured for one semantic plan.
 */
export interface RepositorySourceSnapshot {
    /**
     * Versioned hash of every model-visible source input.
     */
    fingerprint: string;
    /**
     * Git commit observed by the fingerprint operation.
     *
     * @default undefined for an unborn branch.
     */
    gitHead?: string;
}
/**
 * Hashes model-visible source input and returns its observed Git commit.
 *
 * Generated OpenWiki state and ignored paths are excluded. Git, stat, symlink,
 * and file-read failures reject because the fingerprint is a correctness gate.
 *
 * @param cwd - Absolute Git repository root.
 * @param openWikiIgnore - Ignore rules loaded for this run.
 * @returns Paired source fingerprint and Git HEAD.
 */
export declare function createRepositorySourceSnapshot(cwd: string, openWikiIgnore: OpenWikiIgnore): Promise<RepositorySourceSnapshot>;
/**
 * Hashes every model-visible repository source input for one semantic plan.
 *
 * @param cwd - Absolute Git repository root.
 * @param openWikiIgnore - Ignore rules loaded for this run.
 * @returns A versioned `sha256:` fingerprint.
 */
export declare function createRepositorySourceFingerprint(cwd: string, openWikiIgnore: OpenWikiIgnore): Promise<string>;
/**
 * Returns best-effort repository-relative paths for planner context.
 *
 * Unlike the source fingerprint, history lookup failures intentionally produce
 * an empty list and do not weaken lifecycle correctness.
 */
export declare function getRepositoryChangedPaths(cwd: string, openWikiIgnore: OpenWikiIgnore, baseGitHead?: string): Promise<string[]>;
