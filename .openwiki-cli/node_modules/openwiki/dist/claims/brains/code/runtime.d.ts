import type { OpenWikiCommand, OpenWikiOutputMode } from "../../../agent/types.js";
import { OpenWikiIgnore } from "../../../agent/openwiki-ignore.js";
import { ClaimSession } from "./session.js";
import type { GroundingIssue } from "./types.js";
/**
 * Strict repository Claims state rebuilt for each active process.
 */
export interface ClaimsRuntime {
    /**
     * Process-local Claim session for inspecting and replacing page Claims.
     */
    session: ClaimSession;
    /**
     * Number of stable preflight issues detected when the runtime was prepared.
     */
    issueCount: number;
    /**
     * Stable preflight issues supplied to planning and required-page augmentation.
     */
    issues: readonly GroundingIssue[];
    /**
     * Persists Claims and synchronizes verification/page versions or rejects.
     */
    finalize(at?: string, excludedPages?: ReadonlySet<string>): Promise<void>;
}
/**
 * Preparation behavior that differs only when resuming an interrupted init.
 */
export interface PrepareClaimsRuntimeOptions {
    /**
     * Load current-run sidecars instead of starting with empty init state.
     */
    resumeInit?: boolean;
}
/**
 * Builds strict Claims state for repository init/update.
 *
 * @param command - Current OpenWiki command.
 * @param outputMode - Current output target.
 * @param cwd - Absolute repository root.
 * @param openWikiIgnore - Repository read-boundary rules.
 * @param onWarning - Optional sink notified before strict warning rejection.
 * @param options - Fresh-init or resumed-init preparation behavior.
 * @returns `undefined` outside repository generation.
 */
export declare function prepareClaimsRuntime(command: OpenWikiCommand, outputMode: OpenWikiOutputMode, cwd: string, openWikiIgnore: OpenWikiIgnore, onWarning?: (message: string) => void, options?: PrepareClaimsRuntimeOptions): Promise<ClaimsRuntime | undefined>;
