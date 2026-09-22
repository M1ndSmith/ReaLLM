/**
 * Repository evidence URI prefix.
 */
export declare const REPOSITORY_EVIDENCE_PREFIX = "repo://";
/**
 * Inclusive one-based source line range.
 */
export interface RepositoryLineRange {
    /**
     * First selected source line.
     */
    startLine: number;
    /**
     * Last selected source line.
     */
    endLine: number;
}
/**
 * Parsed repository evidence identity.
 */
export interface RepositoryEvidenceResource {
    /**
     * Normalized repository-relative POSIX path.
     */
    path: string;
    /**
     * Optional language-agnostic source line range.
     *
     * @default undefined, which selects whole-file evidence.
     */
    range?: RepositoryLineRange;
}
/**
 * Formats a validated repository evidence identity canonically.
 *
 * @param resource - Normalized repository path and optional line range.
 * @returns Canonical `repo://path#Lx-Ly` resource.
 */
export declare function formatRepositoryEvidenceResource(resource: RepositoryEvidenceResource): string;
/**
 * Parses and validates a `repo://path#Lx-Ly` resource.
 *
 * @param resource - Repository evidence URI to parse.
 * @returns Canonical repository path and optional line range.
 */
export declare function parseRepositoryEvidenceResource(resource: string): RepositoryEvidenceResource;
