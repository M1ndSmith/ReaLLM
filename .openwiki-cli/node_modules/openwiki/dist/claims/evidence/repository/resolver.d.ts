import { OpenWikiIgnore } from "../../../agent/openwiki-ignore.js";
import type { EvidenceResolver, ResolvedEvidence } from "../../core/types.js";
/**
 * Repository evidence resolver options.
 */
export interface RepositoryEvidenceResolverOptions {
    /**
     * Absolute repository root.
     */
    rootDir: string;
    /**
     * Read-boundary rules shared with the OpenWiki agent.
     *
     * @default an inactive rule set that permits every safe repository path.
     */
    openWikiIgnore?: OpenWikiIgnore;
}
/**
 * Resolves and versions `repo://` evidence without model involvement.
 */
export declare class RepositoryEvidenceResolver implements EvidenceResolver {
    /**
     * Absolute repository root.
     */
    private readonly rootDir;
    /**
     * Lazily resolved physical repository root.
     *
     * @default undefined until the first existing evidence file is resolved.
     */
    private realRootDirPromise?;
    /**
     * Repository read-boundary rules.
     */
    private readonly openWikiIgnore;
    constructor(options: RepositoryEvidenceResolverOptions);
    /**
     * Resolves the current line range or whole-file representation.
     *
     * @param resource - Canonical `repo://` resource.
     * @param previousVersion - Prior opaque version used to relocate a range.
     * @returns Current evidence, or `null` when the file/range no longer exists.
     */
    resolve(resource: string, previousVersion?: string): Promise<ResolvedEvidence | null>;
    /**
     * Resolves a repository-relative path while enforcing root containment.
     *
     * @param relativePath - Normalized repository-relative POSIX path.
     * @returns Absolute contained filesystem path.
     */
    private resolveSafePath;
    /**
     * Resolves and caches the physical repository root for symlink checks.
     *
     * @returns Canonical filesystem path for the repository root.
     */
    private getRealRootDir;
}
