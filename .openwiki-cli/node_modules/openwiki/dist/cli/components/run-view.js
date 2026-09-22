import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { formatCount } from "../format.js";
import { buildActivityTreeLines, buildExplorationTreeLines, } from "../run-log/activity.js";
import { findRepositoryProgress, formatRepositoryProgress, } from "../run-log/progress.js";
import { findRunSummary, formatCompletedRunCounts, formatRunCompletionTitle, } from "../run-log/summary.js";
import { Header } from "./header.js";
import { MarkdownText } from "./markdown.js";
import { CredentialDiagnosticsPanel } from "./panels.js";
import { Panel, PromptBlock, StatusLine } from "./primitives.js";
const RUN_SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];
const RUN_SPINNER_INTERVAL_MS = 600;
const MAX_COMPLETED_PATHS = 5;
const DEFAULT_TERMINAL_ROWS = 24;
const EXPLORATION_VIEWPORT_RESERVED_ROWS = 20;
const MAX_EXPLORATION_VIEWPORT_LINES = 14;
const MIN_EXPLORATION_VIEWPORT_LINES = 3;
/**
 * A per-source summary of an ingestion run, one status line per source.
 */
export function IngestionSummary({ result }) {
    return (_jsx(Panel, { title: "Source Runs", children: result.results.map((sourceResult) => (_jsx(StatusLine, { label: sourceResult.displayName, tone: sourceResult.status === "error" ? "error" : "success", value: `${sourceResult.status}; ${sourceResult.rawFiles.length} raw file(s)` }, sourceResult.sourceInstanceId))) }));
}
/**
 * The live agent run view: a compact header, stable run status, and bounded
 * repository/OpenWiki activity trees.
 */
export function RunView({ command, credentialDiagnostics, log, done = false, durationMs, message = null, modelId = null, }) {
    const summary = findRunSummary(log);
    const repositoryProgress = findRepositoryProgress(log);
    const activities = log.filter((item) => item.type === "activity");
    const debugItems = log.filter((item) => item.type === "debug");
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { compact: true, modelId: modelId, showLogo: false, subtitle: done ? "Run complete" : "Agent running" }), message ? _jsx(PromptBlock, { message: message }) : null, _jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { children: done ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: "green", children: "\u2713 " }), _jsx(Text, { bold: true, children: formatRunCompletionTitle(command, log, durationMs) })] })) : (_jsxs(_Fragment, { children: [_jsx(RunSpinner, {}), _jsx(Text, { bold: true, children: "Working" }), " ", _jsxs(Text, { color: "gray", children: ["openwiki ", command, " \u00B7 in progress"] })] })) }), _jsxs(Box, { flexDirection: "column", marginLeft: 2, marginTop: 1, children: [!done ? (_jsx(Text, { children: _jsx(Text, { bold: true, children: repositoryProgress
                                        ? formatRepositoryProgress(repositoryProgress, command)
                                        : getRunStage(command, activities) }) })) : null, !done && summary ? (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { color: summary.errorCount ? "red" : "gray", children: summary.content }) })) : null, !done && activities.length > 0 ? (_jsx(RunActivitySections, { activities: activities, exploredPaths: summary?.exploredPaths ?? [] })) : null, !done
                                ? debugItems.map((item) => (_jsx(DebugLogLine, { item: item }, item.id)))
                                : null, done ? _jsx(CompletedRunDetails, { command: command, log: log }) : null, !done &&
                                !repositoryProgress &&
                                !summary &&
                                activities.length === 0 ? (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { color: "gray", children: "Preparing the run..." }) })) : null] })] }), credentialDiagnostics ? (_jsx(CredentialDiagnosticsPanel, { diagnostics: credentialDiagnostics })) : null] }));
}
/**
 * A slow, fixed-width heartbeat that leaves the surrounding layout stable.
 */
function RunSpinner() {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setFrame((current) => (current + 1) % RUN_SPINNER_FRAMES.length);
        }, RUN_SPINNER_INTERVAL_MS);
        return () => {
            clearInterval(interval);
        };
    }, []);
    return _jsxs(Text, { color: "cyan", children: [RUN_SPINNER_FRAMES[frame], " "] });
}
/**
 * Renders written pages, aggregate counts, diagnostics, and the final assistant
 * response for a completed run.
 */
export function CompletedRunDetails({ command, log, }) {
    const summary = findRunSummary(log);
    const repositoryProgress = findRepositoryProgress(log);
    const assistantText = log.find((item) => item.type === "text");
    const debugItems = log.filter((item) => item.type === "debug");
    const writtenPaths = summary?.writtenPaths ?? [];
    const visiblePaths = writtenPaths.slice(0, MAX_COMPLETED_PATHS);
    const hiddenPathCount = writtenPaths.length - visiblePaths.length;
    const summaryText = formatCompletedRunCounts(summary);
    return (_jsxs(Box, { flexDirection: "column", children: [repositoryProgress?.stage === "noop" ? (_jsx(Text, { color: "gray", children: formatRepositoryProgress(repositoryProgress, command) })) : null, visiblePaths.map((path) => (_jsx(Text, { color: "gray", children: path }, path))), hiddenPathCount > 0 ? (_jsx(Text, { color: "gray", children: formatCount(hiddenPathCount, "additional page", "additional pages") })) : null, debugItems.map((item) => (_jsx(DebugLogLine, { item: item }, item.id))), summaryText ? (_jsx(Box, { marginTop: writtenPaths.length > 0 ? 1 : 0, children: _jsx(Text, { color: summary?.errorCount ? "red" : "gray", children: summaryText }) })) : null, assistantText ? (_jsx(Box, { flexDirection: "column", marginTop: summaryText || writtenPaths.length > 0 ? 1 : 0, children: _jsx(MarkdownText, { markdown: assistantText.content.trim() }) })) : null] }));
}
function DebugLogLine({ item }) {
    return (_jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "- " }), _jsx(Text, { color: "gray", children: item.content })] }));
}
/**
 * Renders active repository/OpenWiki paths followed by bounded recent paths.
 */
function RunActivitySections({ activities, exploredPaths, }) {
    const recentItems = activities.filter((item) => item.activityStatus !== "active");
    const sections = [
        {
            title: "Reading OpenWiki",
            items: activities.filter((item) => item.activityStatus === "active" &&
                item.activityScope === "openwiki" &&
                item.activityOperation !== "write"),
        },
        {
            title: "Writing OpenWiki",
            items: activities.filter((item) => item.activityStatus === "active" &&
                item.activityScope === "openwiki" &&
                item.activityOperation === "write"),
        },
        {
            title: "Writing repository",
            items: activities.filter((item) => item.activityStatus === "active" &&
                item.activityScope === "repository" &&
                item.activityOperation === "write"),
        },
    ].filter((section) => section.items.length > 0);
    const activeRepositoryRead = activities
        .slice()
        .reverse()
        .find((item) => item.activityStatus === "active" &&
        item.activityScope === "repository" &&
        item.activityOperation === "read");
    const showExplorationMap = exploredPaths.length > 0 || activeRepositoryRead !== undefined;
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [sections.map((section) => (_jsx(RunActivitySection, { items: section.items, title: section.title }, section.title))), recentItems.length > 0 ? _jsx(RecentActivity, { items: recentItems }) : null, showExplorationMap ? (_jsx(ExplorationMap, { activePath: activeRepositoryRead?.activityPath, exploredPaths: exploredPaths })) : null] }));
}
function ExplorationMap({ activePath, exploredPaths, }) {
    const lines = buildExplorationTreeLines(exploredPaths, activePath);
    const terminalRows = useTerminalRows();
    const viewportHeight = Math.min(MAX_EXPLORATION_VIEWPORT_LINES, Math.max(MIN_EXPLORATION_VIEWPORT_LINES, terminalRows - EXPLORATION_VIEWPORT_RESERVED_ROWS));
    const maxScrollOffset = Math.max(0, lines.length - viewportHeight);
    const activeLineIndex = lines.findIndex((line) => line.active);
    const followOffset = activeLineIndex === -1
        ? maxScrollOffset
        : Math.min(maxScrollOffset, Math.max(0, activeLineIndex - viewportHeight + 1));
    const [manualScrollOffset, setManualScrollOffset] = useState(null);
    const scrollOffset = manualScrollOffset === null
        ? followOffset
        : Math.min(manualScrollOffset, maxScrollOffset);
    const visibleLines = lines.slice(scrollOffset, scrollOffset + viewportHeight);
    const isScrollable = lines.length > viewportHeight;
    useInput((input, key) => {
        if (input === "f" && !key.ctrl && !key.meta) {
            setManualScrollOffset(null);
            return;
        }
        const lineDelta = key.upArrow || input === "k"
            ? -1
            : key.downArrow || input === "j"
                ? 1
                : key.pageUp
                    ? -viewportHeight
                    : key.pageDown
                        ? viewportHeight
                        : 0;
        if (lineDelta === 0) {
            return;
        }
        setManualScrollOffset((currentOffset) => {
            const effectiveOffset = currentOffset ?? followOffset;
            return Math.min(maxScrollOffset, Math.max(0, effectiveOffset + lineDelta));
        });
    }, { isActive: isScrollable });
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Text, { children: [_jsx(Text, { bold: true, children: "Exploration map" }), _jsx(Text, { color: "gray", children: ` · ${formatCount(exploredPaths.length, "file", "files")}` })] }), _jsx(Box, { flexDirection: "column", marginLeft: 2, children: visibleLines.map((line, index) => (_jsx(Text, { color: line.active ? "cyan" : "gray", wrap: "truncate-end", children: line.label }, `${line.label}:${scrollOffset + index}`))) }), isScrollable ? (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { color: "gray", wrap: "truncate-end", children: `${scrollOffset + 1}–${scrollOffset + visibleLines.length} of ${lines.length} · ↑/↓ or j/k scroll · PgUp/PgDn · f follow · ${manualScrollOffset === null ? "following active file" : "scroll paused"}` }) })) : null] }));
}
function useTerminalRows() {
    const { stdout } = useStdout();
    const [terminalRows, setTerminalRows] = useState(stdout.rows ?? DEFAULT_TERMINAL_ROWS);
    useEffect(() => {
        const updateTerminalRows = () => {
            setTerminalRows(stdout.rows ?? DEFAULT_TERMINAL_ROWS);
        };
        stdout.on("resize", updateTerminalRows);
        return () => {
            stdout.off("resize", updateTerminalRows);
        };
    }, [stdout]);
    return terminalRows;
}
function RunActivitySection({ items, title, }) {
    const visibleItems = items.slice(-4);
    const lines = buildActivityTreeLines(visibleItems.map((item) => ({
        path: item.activityPath,
        status: item.activityStatus,
    })));
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, children: title }), _jsx(Box, { flexDirection: "column", marginLeft: 2, children: lines.map((line, index) => (_jsx(Text, { color: line.status === "error"
                        ? "red"
                        : line.status === "active"
                            ? "cyan"
                            : "gray", wrap: "truncate-end", children: line.label }, `${line.label}:${index}`))) })] }));
}
function RecentActivity({ items }) {
    const visibleItems = items.slice(-4).reverse();
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, children: "Recent activity" }), _jsx(Box, { flexDirection: "column", marginLeft: 2, children: visibleItems.map((item) => (_jsxs(Text, { wrap: "truncate-end", children: [_jsx(Text, { color: item.activityStatus === "error" ? "red" : "gray", children: `${getActivityVerb(item).padEnd(8)} ` }), _jsx(Text, { color: "gray", children: item.activityPath })] }, item.id))) })] }));
}
function getActivityVerb(item) {
    if (item.activityStatus === "error") {
        return "failed";
    }
    return {
        read: "read",
        search: "searched",
        write: "wrote",
    }[item.activityOperation];
}
function getRunStage(command, activities) {
    if (activities.some((item) => item.activityStatus === "active" && item.activityOperation === "write")) {
        return "Writing documentation";
    }
    if (activities.some((item) => item.activityStatus === "active")) {
        return command === "update"
            ? "Tracing affected documentation"
            : "Exploring the repository";
    }
    return command === "update"
        ? "Tracing affected documentation"
        : "Building the documentation map";
}
