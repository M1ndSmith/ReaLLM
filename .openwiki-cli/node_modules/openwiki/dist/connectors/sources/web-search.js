import { TavilySearch } from "@langchain/tavily";
import { OPENWIKI_TAVILY_API_KEY_ENV_KEY } from "../../config/constants.js";
import { normalizeStringArray } from "../config.js";
import { createRunId, readConnectorConfig, readConnectorState, updateStateWithRun, writeConnectorState, writeRawJson, } from "../io.js";
import { openWikiConnectorsDisplayPath } from "../../config/openwiki-home.js";
const definition = {
    backend: "direct-api",
    description: "Fetches web search results with Tavily through the LangChain Tavily integration.",
    displayName: "Web Search",
    id: "web-search",
    mode: "personal",
    requiredEnv: [OPENWIKI_TAVILY_API_KEY_ENV_KEY],
    supportsAgenticDiscovery: false,
};
export function createWebSearchConnector() {
    return {
        ...definition,
        ingest,
    };
}
async function ingest(options = {}) {
    const runId = createRunId();
    const config = {
        ...(await readConnectorConfig("web-search", {
            enabled: true,
            includeAnswer: true,
            includeImages: false,
            includeRawContent: false,
            maxResults: 5,
            queries: [],
            searchDepth: "basic",
            topic: "general",
        })),
        ...(options.connectorConfig ?? {}),
    };
    const state = await readConnectorState("web-search");
    const warnings = [];
    const rawFiles = [];
    if (!config.enabled) {
        return {
            connectorId: "web-search",
            message: `Web Search connector is not enabled. Set enabled=true in ${openWikiConnectorsDisplayPath}/web-search/config.json.`,
            rawFiles,
            runId,
            statePath: `${openWikiConnectorsDisplayPath}/web-search/state.json`,
            status: "skipped",
            warnings,
        };
    }
    const tavilyApiKey = process.env[OPENWIKI_TAVILY_API_KEY_ENV_KEY];
    if (!tavilyApiKey) {
        return {
            connectorId: "web-search",
            message: `${OPENWIKI_TAVILY_API_KEY_ENV_KEY} is required for Web Search ingestion.`,
            rawFiles,
            runId,
            statePath: `${openWikiConnectorsDisplayPath}/web-search/state.json`,
            status: "error",
            warnings,
        };
    }
    const queries = normalizeStringArray(config.queries);
    if (queries.length === 0) {
        return {
            connectorId: "web-search",
            message: `No web search queries configured. Add queries to ${openWikiConnectorsDisplayPath}/web-search/config.json.`,
            rawFiles,
            runId,
            statePath: `${openWikiConnectorsDisplayPath}/web-search/state.json`,
            status: "skipped",
            warnings,
        };
    }
    const limit = getOptionLimit(options.limit, config.maxResults);
    const timeRange = getWindowedTimeRange(config.timeRange, options.windowHours);
    const tool = new TavilySearch({
        excludeDomains: normalizeStringArray(config.excludeDomains),
        includeAnswer: config.includeAnswer ?? true,
        includeDomains: normalizeStringArray(config.includeDomains),
        includeImages: config.includeImages ?? false,
        includeRawContent: config.includeRawContent ?? false,
        maxResults: limit,
        searchDepth: normalizeSearchDepth(config.searchDepth),
        tavilyApiKey,
        timeRange,
        topic: normalizeTopic(config.topic),
    });
    const results = [];
    for (const query of queries) {
        results.push({
            query,
            response: (await tool.invoke({ query })),
        });
    }
    rawFiles.push(await writeRawJson("web-search", runId, "web-search-results.json", {
        fetchedAt: new Date().toISOString(),
        instanceId: options.instanceId,
        maxResults: limit,
        queryCount: queries.length,
        results,
        searchDepth: normalizeSearchDepth(config.searchDepth),
        timeRange,
        topic: normalizeTopic(config.topic),
        windowHours: normalizeWindowHours(options.windowHours),
    }));
    await writeConnectorState("web-search", updateStateWithRun(state, {
        at: new Date().toISOString(),
        rawFiles,
        runId,
        status: "success",
        warnings,
    }));
    return {
        connectorId: "web-search",
        message: `Fetched Tavily results for ${queries.length} web search quer${queries.length === 1 ? "y" : "ies"}.`,
        rawFiles,
        runId,
        statePath: `${openWikiConnectorsDisplayPath}/web-search/state.json`,
        status: "success",
        warnings,
    };
}
function normalizeSearchDepth(value) {
    return value === "advanced" ? "advanced" : "basic";
}
function normalizeTopic(value) {
    return value === "news" ? "news" : "general";
}
function normalizeTimeRange(value) {
    return value === "day" ||
        value === "month" ||
        value === "week" ||
        value === "year"
        ? value
        : undefined;
}
function getWindowedTimeRange(configuredTimeRange, windowHours) {
    const normalized = normalizeTimeRange(configuredTimeRange);
    if (normalized) {
        return normalized;
    }
    const hours = normalizeWindowHours(windowHours);
    return hours !== null && hours <= 24 ? "day" : normalized;
}
function normalizeWindowHours(windowHours) {
    if (typeof windowHours !== "number" || !Number.isFinite(windowHours)) {
        return null;
    }
    return Math.max(1, Math.min(168, Math.trunc(windowHours)));
}
function getOptionLimit(optionLimit, configLimit) {
    const limit = optionLimit ?? configLimit ?? 5;
    return Math.max(1, Math.min(20, Math.trunc(limit)));
}
