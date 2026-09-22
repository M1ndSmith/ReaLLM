import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { openWikiLocalWikiDisplayPath } from "../../config/openwiki-home.js";
import { getDefaultModelId, resolveConfiguredProvider, } from "../../config/constants.js";
import { helpContent, isDevelopmentMode } from "../commands.js";
import { getAuthFixSteps } from "../diagnostics/auth-fix.js";
import { Header } from "./header.js";
import { Panel, Rows, StatusLine } from "./primitives.js";
/**
 * The `--help` screen: usage, commands, options, and examples, gated to also
 * show development-only rows when running in development mode.
 */
export function HelpView() {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { modelId: null, subtitle: helpContent.description }), _jsx(Panel, { title: "Usage", children: helpContent.usage.map((line) => (_jsxs(Text, { children: [" ", line] }, line))) }), _jsx(Panel, { title: "Commands", children: _jsx(Rows, { rows: helpContent.commands }) }), _jsx(Panel, { title: "Options", children: _jsx(Rows, { rows: helpContent.options }) }), isDevelopmentMode() ? (_jsx(Panel, { title: "Development Options", children: _jsx(Rows, { rows: helpContent.developmentOptions }) })) : null, _jsxs(Panel, { title: "Examples", children: [helpContent.examples.map((line) => (_jsxs(Text, { children: [" ", line] }, line))), isDevelopmentMode()
                        ? helpContent.developmentExamples.map((line) => (_jsxs(Text, { children: [" ", line] }, line)))
                        : null] })] }));
}
/**
 * The `--dry-run` execution plan: shows what a run would do without reading
 * credentials, invoking the agent, or writing any files.
 */
export function DryRunView({ command, modelId, shouldStart, userMessage, }) {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { modelId: modelId, subtitle: "Development dry run" }), _jsxs(Panel, { title: "Execution Plan", children: [_jsx(StatusLine, { tone: "active", label: "Command", value: `openwiki ${command}` }), _jsx(StatusLine, { tone: "muted", label: "Mode", value: command }), _jsx(StatusLine, { tone: "muted", label: "Credentials", value: "not read or requested" }), _jsx(StatusLine, { tone: "muted", label: "Model", value: modelId ??
                            `saved setting or ${getDefaultModelId(resolveConfiguredProvider())}` }), _jsx(StatusLine, { tone: "muted", label: "Agent", value: "not invoked" }), _jsx(StatusLine, { tone: "muted", label: "Writes", value: "no files or metadata" }), _jsx(StatusLine, { tone: "muted", label: "Output", value: openWikiLocalWikiDisplayPath }), _jsx(StatusLine, { tone: "muted", label: "Startup", value: shouldStart ? "would start run" : "would open chat" }), userMessage ? (_jsx(StatusLine, { tone: "muted", label: "Message", value: userMessage })) : null] })] }));
}
/**
 * Diagnostics for configured credentials. Explicitly never prints raw secret
 * values; only the source, length, a safe preview, and any warnings.
 */
export function CredentialDiagnosticsPanel({ diagnostics, }) {
    return (_jsxs(Panel, { title: "Credential Diagnostics", children: [_jsx(Text, { color: "gray", children: "Raw secret values are intentionally not printed." }), diagnostics.map((diagnostic) => (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { children: [_jsx(Text, { bold: true, children: diagnostic.key }), " ", _jsxs(Text, { color: "gray", children: ["source=", diagnostic.source] })] }), _jsxs(Text, { children: ["length=", diagnostic.length ?? "unset", " preview=", diagnostic.preview] }), _jsxs(Text, { color: diagnostic.warnings.length > 0 ? "yellow" : "gray", children: ["warnings=", diagnostic.warnings.length > 0
                                ? diagnostic.warnings.join(", ")
                                : "none"] })] }, diagnostic.key)))] }));
}
/**
 * The ordered "how to fix" steps for an auth failure. Shared by the interactive
 * panel and the --print stderr path so they stay in sync. Names env keys only,
 * never secret values.
 */
export function AuthFixPanel({ authFix }) {
    const steps = getAuthFixSteps(authFix);
    return (_jsxs(Panel, { title: "How to fix", children: [_jsx(Text, { children: "Your provider rejected the credentials for this run." }), steps.map((step, index) => (_jsxs(Text, { children: [_jsxs(Text, { color: "cyan", children: [index + 1, ". "] }), step] }, step))), _jsx(Text, { color: "gray", children: "For full detail, re-run with --debug." })] }));
}
/**
 * Debug-mode error diagnostics. Only allowlisted, non-secret error fields are
 * shown, gated behind OPENWIKI_DEBUG.
 */
export function ErrorDiagnosticsPanel({ diagnostics, }) {
    return (_jsxs(Panel, { title: "Error Diagnostics", children: [_jsx(Text, { color: "gray", children: "OPENWIKI_DEBUG=1 is enabled. Only allowlisted, non-secret error fields are shown." }), diagnostics.map((diagnostic) => (_jsxs(Text, { children: [_jsx(Text, { bold: true, children: diagnostic.label }), " ", diagnostic.value] }, diagnostic.label)))] }));
}
