import type { OpenWikiRunEvent } from "../../agent/types.js";
import type { RunActivityOperation, RunActivityScope, RunActivityStatus } from "./types.js";
/**
 * A path operation derived from an explicit filesystem tool call.
 */
export interface ToolPathActivity {
    /**
     * Filesystem operation represented by the tool call.
     */
    operation: RunActivityOperation;
    /**
     * Normalized repository-relative path or search scope.
     */
    path: string;
    /**
     * Side of the run that owns the path.
     */
    scope: RunActivityScope;
}
/**
 * A printable line in the compact activity tree.
 */
export interface ActivityTreeLine {
    /**
     * Fully formatted tree branch and path-segment label.
     */
    label: string;
    /**
     * Lifecycle status attached to a leaf path, when present.
     *
     * @default undefined - this line is an intermediate directory node.
     */
    status?: RunActivityStatus;
}
/**
 * A printable line in the cumulative repository exploration map.
 */
export interface ExplorationTreeLine {
    /**
     * Fully formatted tree branch, directory count, or active filename.
     */
    label: string;
    /**
     * Whether this line belongs to the file currently being read.
     */
    active: boolean;
}
/**
 * One normalized path used as input to the printable activity tree.
 */
interface ActivityTreeInput {
    /**
     * Repository-relative path to add to the tree.
     */
    path: string;
    /**
     * Lifecycle status to attach to the terminal path node.
     *
     * @default undefined - the terminal node has no explicit status.
     */
    status?: RunActivityStatus;
}
/**
 * Extracts exact paths or search scopes from a filesystem tool start. Shell
 * commands are deliberately excluded because their text is not reliable path
 * provenance.
 */
export declare function getToolPathActivities(event: Extract<OpenWikiRunEvent, {
    type: "tool_start";
}>): ToolPathActivity[];
/**
 * Builds the visible ancestry for a set of active paths, producing a familiar
 * repository-tree shape without rendering the repository's inactive files.
 */
export declare function buildActivityTreeLines(activities: ReadonlyArray<ActivityTreeInput>): ActivityTreeLine[];
/**
 * Builds a cumulative directory map containing every successfully read
 * repository file. The current read is included and highlighted while active.
 */
export declare function buildExplorationTreeLines(exploredPaths: readonly string[], activePath: string | undefined): ExplorationTreeLine[];
/**
 * Returns whether a normalized activity path is a persistent OpenWiki page.
 * Non-Markdown sidecars are deliberately excluded from completion page counts.
 */
export declare function isOpenWikiPagePath(activityPath: string): boolean;
export {};
