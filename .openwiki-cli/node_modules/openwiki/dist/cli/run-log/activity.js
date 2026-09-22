import path from "node:path";
import { isRecord } from "../guards.js";
import { parseToolInput } from "./tool-input.js";
const PATH_KEYS = [
    "path",
    "paths",
    "file",
    "files",
    "file_path",
    "file_paths",
];
/**
 * Extracts exact paths or search scopes from a filesystem tool start. Shell
 * commands are deliberately excluded because their text is not reliable path
 * provenance.
 */
export function getToolPathActivities(event) {
    const input = parseToolInput(event.input);
    let operation;
    let rawPaths;
    switch (event.name) {
        case "read_file":
            operation = "read";
            rawPaths = getInputPaths(input, PATH_KEYS);
            break;
        case "edit_file":
        case "write_file":
            operation = "write";
            rawPaths = getInputPaths(input, PATH_KEYS);
            break;
        case "glob":
            operation = "search";
            rawPaths = getSearchScopes(input, ["path", "directory", "pattern"]);
            break;
        case "grep":
            operation = "search";
            rawPaths = getSearchScopes(input, ["path", "directory", "glob"]);
            break;
        case "ls":
            operation = "search";
            rawPaths = getInputPaths(input, ["path", "directory"]);
            break;
        default:
            return [];
    }
    return [...new Set(rawPaths)]
        .map(normalizeActivityPath)
        .filter((activityPath) => activityPath !== null)
        .map((activityPath) => ({
        operation,
        path: activityPath,
        scope: getActivityScope(activityPath),
    }));
}
/**
 * Builds the visible ancestry for a set of active paths, producing a familiar
 * repository-tree shape without rendering the repository's inactive files.
 */
export function buildActivityTreeLines(activities) {
    const root = { children: new Map() };
    for (const activity of activities) {
        const parts = activity.path === "." ? ["."] : activity.path.split("/");
        let node = root;
        for (const part of parts) {
            const existing = node.children.get(part);
            const child = existing ?? { children: new Map() };
            node.children.set(part, child);
            node = child;
        }
        node.status = activity.status;
    }
    const lines = [];
    appendTreeLines(root, "", lines);
    return lines;
}
/**
 * Builds a cumulative directory map containing every successfully read
 * repository file. The current read is included and highlighted while active.
 */
export function buildExplorationTreeLines(exploredPaths, activePath) {
    const activities = [...new Set(exploredPaths)].map((exploredPath) => ({ path: exploredPath, status: "recent" }));
    if (activePath) {
        activities.push({ path: activePath, status: "active" });
    }
    return buildActivityTreeLines(activities).map((line) => ({
        active: line.status === "active",
        label: line.label,
    }));
}
/**
 * Returns whether a normalized activity path is a persistent OpenWiki page.
 * Non-Markdown sidecars are deliberately excluded from completion page counts.
 */
export function isOpenWikiPagePath(activityPath) {
    return activityPath.startsWith("openwiki/") && activityPath.endsWith(".md");
}
function appendTreeLines(node, prefix, lines) {
    const children = [...node.children.entries()].sort(([left], [right]) => left.localeCompare(right));
    children.forEach(([name, child], index) => {
        const isLast = index === children.length - 1;
        const hasChildren = child.children.size > 0;
        lines.push({
            label: `${prefix}${isLast ? "└─" : "├─"} ${name}${hasChildren ? "/" : ""}`,
            status: child.status,
        });
        appendTreeLines(child, `${prefix}${isLast ? "   " : "│  "}`, lines);
    });
}
function getInputPaths(input, keys) {
    if (typeof input === "string") {
        return [input];
    }
    if (Array.isArray(input)) {
        return input.filter((value) => typeof value === "string");
    }
    if (!isRecord(input)) {
        return [];
    }
    for (const key of keys) {
        const value = input[key];
        if (typeof value === "string") {
            return [value];
        }
        if (Array.isArray(value)) {
            return value.filter((candidate) => typeof candidate === "string");
        }
    }
    return [];
}
function getSearchScopes(input, keys) {
    return getInputPaths(input, keys).map(getSearchScope);
}
function getSearchScope(value) {
    const normalized = value.replaceAll("\\", "/");
    const wildcardIndex = normalized.search(/[*?[\]{}]/u);
    if (wildcardIndex === -1) {
        return normalized;
    }
    const prefix = normalized.slice(0, wildcardIndex);
    if (prefix.endsWith("/")) {
        return prefix.replace(/\/$/u, "") || ".";
    }
    return prefix.length > 0 ? path.posix.dirname(prefix) : ".";
}
function normalizeActivityPath(value) {
    const trimmed = value.trim().replaceAll("\\", "/");
    if (trimmed.length === 0 || trimmed.includes("://")) {
        return null;
    }
    const normalized = path.posix
        .normalize(trimmed.replace(/^\/+|^\.\//u, ""))
        .replace(/^\.\//u, "");
    if (normalized === ".." || normalized.startsWith("../")) {
        return null;
    }
    return normalized.length > 0 ? normalized : ".";
}
function getActivityScope(activityPath) {
    return activityPath === "openwiki" ||
        activityPath.startsWith("openwiki/") ||
        activityPath === ".claims" ||
        activityPath.startsWith(".claims/")
        ? "openwiki"
        : "repository";
}
