import { OPENWIKI_GMAIL_ACCESS_TOKEN_ENV_KEY, OPENWIKI_GMAIL_REFRESH_TOKEN_ENV_KEY, } from "../../config/constants.js";
import { getOAuthAccessToken, refreshOAuthAccessToken, } from "../../auth/tokens.js";
import { fetchWithResilience } from "../http.js";
import { normalizeStringArray } from "../config.js";
import { openWikiConnectorsDisplayPath } from "../../config/openwiki-home.js";
import { createRunId, readConnectorConfig, readConnectorState, updateStateWithRun, writeConnectorState, writeRawJson, } from "../io.js";
const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1";
const DEFAULT_METADATA_HEADERS = [
    "From",
    "To",
    "Cc",
    "Bcc",
    "Subject",
    "Date",
    "Message-ID",
];
const definition = {
    backend: "direct-api",
    description: "Fetches recent Gmail messages through the Gmail API with OAuth user credentials.",
    displayName: "Google / Gmail",
    id: "google",
    mode: "personal",
    requiredEnv: [
        OPENWIKI_GMAIL_ACCESS_TOKEN_ENV_KEY,
        OPENWIKI_GMAIL_REFRESH_TOKEN_ENV_KEY,
    ],
    supportsAgenticDiscovery: false,
};
export function createGmailConnector() {
    return {
        ...definition,
        ingest,
    };
}
async function ingest(options = {}) {
    const runId = createRunId();
    const config = {
        ...(await readConnectorConfig("google", {
            enabled: true,
            format: "full",
            includeSpamTrash: false,
            labelIds: [],
            maxMessages: 100,
            metadataHeaders: DEFAULT_METADATA_HEADERS,
            pageSize: 100,
            query: "newer_than:1d",
        })),
        ...(options.connectorConfig ?? {}),
    };
    const state = await readConnectorState("google");
    const warnings = [];
    const rawFiles = [];
    if (!isGmailEnabled(config)) {
        return {
            connectorId: "google",
            message: `Google / Gmail connector is not enabled. Set enabled=true in ${openWikiConnectorsDisplayPath}/google/config.json.`,
            rawFiles,
            runId,
            statePath: `${openWikiConnectorsDisplayPath}/google/state.json`,
            status: "skipped",
            warnings,
        };
    }
    if (isLegacyMcpGmailConfig(config)) {
        warnings.push("Ignoring legacy Gmail MCP placeholder config; direct Gmail API ingestion is enabled by default.");
    }
    const accessToken = await getOAuthAccessToken("gmail");
    const messageLimit = getOptionLimit(options.limit, config.maxMessages);
    const query = getWindowedGmailQuery(config.query, options.windowHours);
    const listResult = await listGmailMessages(accessToken, {
        includeSpamTrash: config.includeSpamTrash,
        labelIds: config.labelIds,
        maxMessages: messageLimit,
        pageSize: config.pageSize,
        query,
    });
    const format = normalizeGmailFormat(config.format);
    const messages = [];
    for (const message of listResult.messageRefs) {
        if (!message.id) {
            continue;
        }
        messages.push(await getGmailMessage(accessToken, message.id, {
            format,
            metadataHeaders: config.metadataHeaders,
        }));
    }
    rawFiles.push(await writeRawJson("google", runId, "gmail-messages.json", {
        fetchedAt: new Date().toISOString(),
        format,
        includeSpamTrash: Boolean(config.includeSpamTrash),
        labelIds: normalizeStringArray(config.labelIds),
        listPages: listResult.pages,
        maxMessages: messageLimit,
        messageCount: messages.length,
        messages,
        query,
        windowHours: normalizeWindowHours(options.windowHours),
    }));
    await writeConnectorState("google", updateStateWithRun(state, {
        at: new Date().toISOString(),
        rawFiles,
        runId,
        status: rawFiles.length > 0 ? "success" : "skipped",
        warnings,
    }));
    return {
        connectorId: "google",
        message: `Fetched ${messages.length} Gmail message(s).`,
        rawFiles,
        runId,
        statePath: `${openWikiConnectorsDisplayPath}/google/state.json`,
        status: rawFiles.length > 0 ? "success" : "skipped",
        warnings,
    };
}
async function listGmailMessages(accessToken, options) {
    const messageRefs = [];
    const pages = [];
    let pageToken;
    while (messageRefs.length < options.maxMessages) {
        const pageSize = Math.min(clamp(options.pageSize, 1, 500), options.maxMessages - messageRefs.length);
        const page = await gmailApi(accessToken, "/users/me/messages", {
            includeSpamTrash: String(Boolean(options.includeSpamTrash)),
            maxResults: String(pageSize),
            pageToken,
            q: getGmailQuery(options.query),
        }, normalizeStringArray(options.labelIds).map((labelId) => [
            "labelIds",
            labelId,
        ]));
        const pageMessages = page.messages ?? [];
        messageRefs.push(...pageMessages);
        pages.push({
            messageCount: pageMessages.length,
            resultSizeEstimate: page.resultSizeEstimate,
        });
        pageToken = page.nextPageToken;
        if (!pageToken || pageMessages.length === 0) {
            break;
        }
    }
    return {
        messageRefs: messageRefs.slice(0, options.maxMessages),
        pages,
    };
}
async function getGmailMessage(accessToken, messageId, options) {
    return await gmailApi(accessToken, `/users/me/messages/${encodeURIComponent(messageId)}`, {
        format: options.format,
    }, options.format === "metadata"
        ? normalizeStringArray(options.metadataHeaders).map((header) => [
            "metadataHeaders",
            header,
        ])
        : []);
}
async function gmailApi(accessToken, endpointPath, params, repeatedParams = []) {
    const response = await fetchGmail(accessToken, endpointPath, params, repeatedParams);
    if (response.status !== 401) {
        return (await parseGmailResponse(response));
    }
    const refreshedToken = await refreshOAuthAccessToken("gmail");
    const retryResponse = await fetchGmail(refreshedToken, endpointPath, params, repeatedParams);
    return (await parseGmailResponse(retryResponse));
}
async function fetchGmail(accessToken, endpointPath, params, repeatedParams) {
    const url = new URL(`${GMAIL_API_BASE_URL}${endpointPath}`);
    for (const [key, value] of Object.entries(removeEmptyValues(params))) {
        url.searchParams.set(key, value);
    }
    for (const [key, value] of repeatedParams) {
        url.searchParams.append(key, value);
    }
    return await fetchWithResilience(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
}
async function parseGmailResponse(response) {
    if (!response.ok) {
        throw new Error(`Gmail API request failed: ${response.status} ${response.statusText}`);
    }
    return await response.json();
}
function isGmailEnabled(config) {
    if (isLegacyMcpGmailConfig(config)) {
        return true;
    }
    return config.enabled !== false;
}
function isLegacyMcpGmailConfig(config) {
    return (config.transport !== undefined || config.readOnlyOperations !== undefined);
}
function getGmailQuery(query) {
    const normalized = query?.trim();
    return normalized && normalized.length > 0 ? normalized : "newer_than:1d";
}
function getWindowedGmailQuery(query, windowHours) {
    const normalizedQuery = getGmailQuery(query);
    const hours = normalizeWindowHours(windowHours);
    if (hours === null) {
        return normalizedQuery;
    }
    const windowQuery = `newer_than:${Math.max(1, Math.ceil(hours / 24))}d`;
    const baseQuery = stripGmailDateOperators(normalizedQuery);
    return baseQuery.length > 0 ? `${baseQuery} ${windowQuery}` : windowQuery;
}
function stripGmailDateOperators(query) {
    return query
        .split(/\s+/u)
        .filter((token) => !/^(?:newer_than|older_than|newer|older|after|before):.+/iu.test(token))
        .join(" ")
        .trim();
}
function normalizeWindowHours(windowHours) {
    if (typeof windowHours !== "number" || !Number.isFinite(windowHours)) {
        return null;
    }
    return Math.max(1, Math.min(168, Math.trunc(windowHours)));
}
function normalizeGmailFormat(format) {
    return ["full", "metadata", "minimal"].includes(format ?? "")
        ? format
        : "full";
}
function getOptionLimit(optionLimit, configLimit) {
    return clamp(optionLimit ?? configLimit, 1, 500);
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, Math.trunc(value ?? min)));
}
function removeEmptyValues(values) {
    return Object.fromEntries(Object.entries(values).filter((entry) => typeof entry[1] === "string" && entry[1].length > 0));
}
