import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { formatChatGptAccountFromEnv } from "../../agent/openai-chatgpt-oauth.js";
import { getDefaultModelId, getProviderLabel, OPENWIKI_MODEL_ID_ENV_KEY, OPENWIKI_REASONING_EFFORT_ENV_KEY, OPENWIKI_VERSION, resolveConfiguredProvider, } from "../../config/constants.js";
import { sanitizeHeaderValue } from "../diagnostics/sanitize.js";
import { formatCwd } from "../format.js";
/** The OpenWiki ASCII wordmark shown at the top of the full header. */
export const OPENWIKI_LOGO_LINES = [
    "  ___                  __        ___ _    _ ",
    " / _ \\ _ __   ___ _ __ \\ \\      / (_) | _(_)",
    "| | | | '_ \\ / _ \\ '_ \\ \\ \\ /\\ / /| | |/ / |",
    "| |_| | |_) |  __/ | | | \\ V  V / | |   <| |",
    " \\___/| .__/ \\___|_| |_|  \\_/\\_/  |_|_|\\_\\_|",
    "      |_|",
];
/** Width of the widest logo line, used to gate whether the logo fits. */
export const OPENWIKI_LOGO_WIDTH = Math.max(...OPENWIKI_LOGO_LINES.map((line) => line.length));
/**
 * The session header showing OpenWiki version, provider, model, optional
 * reasoning effort, directory, and LangSmith tracing state. Renders a compact
 * single-line variant or the full bordered form with logo. All interpolated values pass through
 * sanitizeHeaderValue so control characters cannot reach the terminal.
 */
export function Header({ compact = false, modelId, showLogo = true, subtitle, }) {
    const terminalColumns = process.stdout.columns ?? 80;
    const displayModelId = sanitizeHeaderValue(modelId ??
        process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
        getDefaultModelId(resolveConfiguredProvider()), Math.max(8, terminalColumns - 12));
    const configuredReasoningEffort = process.env[OPENWIKI_REASONING_EFFORT_ENV_KEY]?.trim();
    const displayReasoningEffort = configuredReasoningEffort
        ? sanitizeHeaderValue(configuredReasoningEffort, Math.max(8, terminalColumns - 20))
        : null;
    const configuredProvider = resolveConfiguredProvider();
    const displayProvider = getProviderLabel(configuredProvider);
    const chatGptAccount = configuredProvider === "openai-chatgpt"
        ? formatChatGptAccountFromEnv()
        : null;
    const displayDirectory = sanitizeHeaderValue(formatCwd(process.cwd()), Math.max(8, terminalColumns - 17));
    const shouldShowLogo = showLogo && terminalColumns > OPENWIKI_LOGO_WIDTH;
    const tracingEnabled = process.env.LANGCHAIN_TRACING_V2 === "true" &&
        Boolean(process.env.LANGSMITH_API_KEY);
    if (compact) {
        return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Text, { wrap: "truncate", children: [_jsx(Text, { color: "cyan", children: ">_ " }), _jsx(Text, { bold: true, children: "OpenWiki" }), " ", _jsxs(Text, { color: "gray", children: ["v", OPENWIKI_VERSION] }), " ", _jsx(Text, { color: "gray", children: "provider: " }), _jsx(Text, { color: "white", children: displayProvider }), " ", chatGptAccount ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: "gray", children: "account: " }), _jsx(Text, { color: "white", children: chatGptAccount }), " "] })) : null, _jsx(Text, { color: "gray", children: "model: " }), _jsx(Text, { color: "white", children: displayModelId }), displayReasoningEffort ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: "gray", children: " effort: " }), _jsx(Text, { color: "white", children: displayReasoningEffort })] })) : null] }), _jsxs(Text, { children: [_jsx(Text, { color: tracingEnabled ? "green" : "gray", children: tracingEnabled ? "* " : "- " }), _jsxs(Text, { color: tracingEnabled ? "green" : "gray", children: ["LangSmith tracing ", tracingEnabled ? "enabled" : "disabled"] }), _jsx(Text, { color: "gray", children: " - " }), _jsx(Text, { color: "cyan", children: subtitle })] })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [shouldShowLogo ? (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: OPENWIKI_LOGO_LINES.map((line) => (_jsx(Text, { bold: true, color: "cyan", wrap: "truncate", children: line }, line))) })) : null, _jsxs(Box, { borderColor: "cyan", borderStyle: "round", flexDirection: "column", marginBottom: 1, paddingX: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: "cyan", children: ">_ " }), _jsx(Text, { bold: true, children: "OpenWiki" }), " ", _jsxs(Text, { color: "gray", children: ["v", OPENWIKI_VERSION] }), " ", _jsx(Text, { color: "gray", children: "agent docs for codebases" })] }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "provider: " }), _jsx(Text, { color: "white", children: displayProvider })] }), chatGptAccount ? (_jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "account: " }), _jsx(Text, { color: "white", children: chatGptAccount })] })) : null, _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "model: " }), _jsx(Text, { color: "white", children: displayModelId })] }), displayReasoningEffort ? (_jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "reasoning effort: " }), _jsx(Text, { color: "white", children: displayReasoningEffort })] })) : null, _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "directory: " }), _jsx(Text, { color: "white", children: displayDirectory })] })] }), _jsxs(Text, { children: [_jsx(Text, { color: tracingEnabled ? "green" : "gray", children: tracingEnabled ? "* " : "- " }), _jsxs(Text, { color: tracingEnabled ? "green" : "gray", children: ["LangSmith tracing ", tracingEnabled ? "enabled" : "disabled"] }), _jsx(Text, { color: "gray", children: " - " }), _jsx(Text, { color: "cyan", children: subtitle })] }), _jsx(Text, { color: "gray", children: "Tip: ask for a docs change, or use /exit when you are done." })] }));
}
