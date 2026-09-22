import type { BackendProtocolV2 } from "deepagents";
import type { OpenWikiOutputMode } from "../agent/types.js";
import { type IndexLabels } from "./index-labels.js";
/**
 * Synchronizes the index for every directory in the configured wiki.
 */
export declare function synchronizeWikiIndexes(backend: BackendProtocolV2, outputMode: OpenWikiOutputMode, labels?: IndexLabels, conceptType?: string): Promise<void>;
/**
 * Normalizes every concept page's OKF front matter across the wiki, without
 * touching indexes.
 *
 * Runs before the agent so an update operates over an already-conformant wiki:
 * legacy or externally edited pages are migrated to a minimal OKF block (tagged
 * `openwiki_generated`) up front, letting the agent read clean metadata and
 * enrich flagged pages in the same run.
 */
export declare function migrateWikiToOkf(backend: BackendProtocolV2, outputMode: OpenWikiOutputMode, conceptType?: string): Promise<void>;
/**
 * Lists the non-structural Markdown concepts currently present in the wiki.
 *
 * @param backend - Filesystem abstraction rooted at the active wiki target.
 * @param outputMode - Whether the wiki lives at `/` or `/openwiki`.
 * @returns Stable, sorted virtual paths for every concept page.
 */
export declare function listWikiConceptPaths(backend: BackendProtocolV2, outputMode: OpenWikiOutputMode): Promise<string[]>;
