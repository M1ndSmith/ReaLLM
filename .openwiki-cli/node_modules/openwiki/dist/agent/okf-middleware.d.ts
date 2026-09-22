import type { BackendProtocolV2 } from "deepagents";
import type { ClaimEvidenceResources } from "../okf/claim-sources.js";
import { type IndexLabels } from "../okf/index-labels.js";
import type { OpenWikiOutputMode } from "./types.js";
/**
 * Creates middleware that keeps the wiki OKF-conformant around a run. It
 * migrates existing pages to valid front matter before the agent starts,
 * snapshots their exact bodies, synchronizes indexes after the run, and
 * stamps final code-owned `generated` provenance on every new or changed page.
 *
 * `now` is the run's single stamp time (an ISO 8601 datetime), computed once by
 * the caller and threaded in so every page written in one run shares one
 * `generated.at` and the stamping stays deterministic under test. It defaults to
 * the current time so callers that do not stamp (or tests exercising only the
 * index passes) need not supply one.
 *
 * `claimSources`, when supplied by a repository Claims runtime, is read only
 * during finalization so it reflects every mutation accepted during the run.
 *
 * @param backend - Filesystem abstraction rooted to the active wiki target.
 * @param outputMode - Repository or local-wiki output layout.
 * @param labels - Localized labels used by generated indexes.
 * @param conceptType - Fallback OKF concept type used during migration.
 * @param now - Shared ISO 8601 timestamp for generated provenance events.
 * @param claimSources - Optional deferred Claims evidence projection.
 * @returns LangChain middleware for the deterministic wiki lifecycle.
 */
export declare function createOpenWikiIndexMiddleware(backend: BackendProtocolV2, outputMode: OpenWikiOutputMode, labels?: IndexLabels, conceptType?: string, now?: string, claimSources?: () => ClaimEvidenceResources): import("langchain").AgentMiddleware<undefined, undefined, unknown, readonly (import("@langchain/core/tools").ClientTool | import("@langchain/core/tools").ServerTool)[], readonly []>;
/**
 * Deterministically repairs invalid OKF metadata after a wiki write. A warning
 * is appended only when the repaired bytes cannot be persisted or re-read.
 */
export declare function addFrontmatterWarning<Result>(result: Result, backend: BackendProtocolV2, outputMode: OpenWikiOutputMode, toolName: string, conceptType?: string): Promise<Result>;
