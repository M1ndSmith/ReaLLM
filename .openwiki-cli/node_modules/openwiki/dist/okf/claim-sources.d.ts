import type { BackendProtocolV2 } from "deepagents";
import type { OpenWikiOutputMode } from "../agent/types.js";
/**
 * Page-local repository evidence resources keyed by virtual concept path.
 */
export type ClaimEvidenceResources = ReadonlyMap<string, readonly string[]>;
/**
 * Projects page-owned Claims evidence files into OKF `sources` front matter.
 *
 * Existing producer-authored source entries are retained. OpenWiki-owned
 * entries receive deterministic IDs derived from their resource, allowing a
 * later Claims reconciliation to replace or remove only its own projection.
 * Pages without Claims state are left untouched.
 *
 * @param backend - Active generated-wiki filesystem.
 * @param outputMode - Current wiki target.
 * @param resourcesByPage - Complete current evidence resources per Claims page.
 */
export declare function synchronizeClaimSources(backend: BackendProtocolV2, outputMode: OpenWikiOutputMode, resourcesByPage: ClaimEvidenceResources): Promise<void>;
