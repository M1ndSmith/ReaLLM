import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { OPEN_WIKI_DIR } from "../config/constants.js";
import { ensureOpenWikiHome, openWikiHomeDir, } from "../config/openwiki-home.js";
export const openWikiOnboardingPath = path.join(openWikiHomeDir, "onboarding.json");
export const openWikiInstructionsPath = path.join(openWikiHomeDir, "INSTRUCTIONS.md");
export const REPOSITORY_INSTRUCTIONS_FILE = "INSTRUCTIONS.md";
export function createEmptyOnboardingConfig() {
    return {
        sourceInstances: [],
        sources: {},
        version: 1,
    };
}
export async function readOpenWikiOnboardingConfig() {
    await ensureOpenWikiHome();
    try {
        const config = normalizeOnboardingConfig(JSON.parse(await readFile(openWikiOnboardingPath, "utf8")));
        return {
            ...config,
            wikiGoal: await readWikiInstructions(),
        };
    }
    catch (error) {
        if (isFileNotFoundError(error)) {
            const wikiGoal = await readWikiInstructions();
            return wikiGoal
                ? { ...createEmptyOnboardingConfig(), wikiGoal }
                : createEmptyOnboardingConfig();
        }
        throw error;
    }
}
export async function saveOpenWikiOnboardingConfig(config) {
    await ensureOpenWikiHome();
    const normalizedConfig = normalizeOnboardingConfig(config);
    const { wikiGoal, ...jsonConfig } = normalizedConfig;
    await writeFile(openWikiOnboardingPath, `${JSON.stringify(jsonConfig, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    await chmod(openWikiOnboardingPath, 0o600);
    if (wikiGoal?.trim()) {
        await writeFile(openWikiInstructionsPath, `${wikiGoal.trim()}\n`, {
            encoding: "utf8",
            mode: 0o600,
        });
        await chmod(openWikiInstructionsPath, 0o600);
    }
}
export function getRepositoryWikiInstructionsPath(repoRoot) {
    return path.join(repoRoot, OPEN_WIKI_DIR, REPOSITORY_INSTRUCTIONS_FILE);
}
export async function readRepositoryWikiInstructions(repoRoot) {
    try {
        const content = (await readFile(getRepositoryWikiInstructionsPath(repoRoot), "utf8")).trim();
        return content.length > 0 ? content : undefined;
    }
    catch (error) {
        if (isFileNotFoundError(error)) {
            return undefined;
        }
        throw error;
    }
}
function readRepositoryWikiInstructionsSync(repoRoot) {
    const instructionsPath = getRepositoryWikiInstructionsPath(repoRoot);
    if (!existsSync(instructionsPath)) {
        return undefined;
    }
    const content = readFileSync(instructionsPath, "utf8").trim();
    return content.length > 0 ? content : undefined;
}
export async function saveRepositoryWikiInstructions(repoRoot, wikiGoal) {
    const instructionsPath = getRepositoryWikiInstructionsPath(repoRoot);
    await mkdir(path.dirname(instructionsPath), { recursive: true });
    await writeFile(instructionsPath, `${wikiGoal.trim()}\n`, {
        encoding: "utf8",
        mode: 0o644,
    });
}
export function isOnboardingComplete(config) {
    return Boolean(config.completedAt &&
        config.wikiGoal &&
        (isCodeModeConfig(config) || config.ingestionSchedule));
}
export function isOpenWikiOnboardingCompleteSync() {
    if (!existsSync(openWikiOnboardingPath)) {
        return false;
    }
    try {
        const config = normalizeOnboardingConfig(JSON.parse(readFileSync(openWikiOnboardingPath, "utf8")));
        const wikiGoal = readWikiInstructionsSync();
        return isOnboardingComplete({ ...config, wikiGoal });
    }
    catch {
        return false;
    }
}
export function isRepositoryCodeOnboardingCompleteSync(repoRoot) {
    if (!existsSync(openWikiOnboardingPath)) {
        return false;
    }
    try {
        const config = normalizeOnboardingConfig(JSON.parse(readFileSync(openWikiOnboardingPath, "utf8")));
        if (!isCodeModeConfig(config)) {
            return false;
        }
        const wikiGoal = readRepositoryWikiInstructionsSync(repoRoot);
        return isOnboardingComplete({
            ...config,
            wikiGoal,
        });
    }
    catch {
        return false;
    }
}
async function readWikiInstructions() {
    try {
        const content = (await readFile(openWikiInstructionsPath, "utf8")).trim();
        return content.length > 0 ? content : undefined;
    }
    catch (error) {
        if (isFileNotFoundError(error)) {
            return undefined;
        }
        throw error;
    }
}
function readWikiInstructionsSync() {
    if (!existsSync(openWikiInstructionsPath)) {
        return undefined;
    }
    const content = readFileSync(openWikiInstructionsPath, "utf8").trim();
    return content.length > 0 ? content : undefined;
}
function normalizeOnboardingConfig(value) {
    if (!isObject(value)) {
        return createEmptyOnboardingConfig();
    }
    const sources = isObject(value.sources) ? value.sources : {};
    const config = {
        sourceInstances: [],
        sources: {},
        version: 1,
    };
    if (typeof value.completedAt === "string") {
        config.completedAt = value.completedAt;
    }
    if (typeof value.wikiGoal === "string") {
        config.wikiGoal = value.wikiGoal;
    }
    if (typeof value.modeId === "string") {
        config.modeId = value.modeId;
    }
    if (typeof value.modeName === "string") {
        config.modeName = value.modeName;
    }
    if (typeof value.templateId === "string") {
        config.templateId = value.templateId;
        config.modeId ??= value.templateId;
    }
    if (typeof value.templateName === "string") {
        config.templateName = value.templateName;
        config.modeName ??= value.templateName;
    }
    if (isObject(value.ingestionSchedule)) {
        config.ingestionSchedule = normalizeSourceScheduleConfig(value.ingestionSchedule);
    }
    if (isObject(value.powerManagement)) {
        config.powerManagement = normalizePowerManagementConfig(value.powerManagement);
    }
    for (const [sourceId, sourceValue] of Object.entries(sources)) {
        if (!isKnownConnectorId(sourceId) || !isObject(sourceValue)) {
            continue;
        }
        const sourceConfig = normalizeSourceConfig(sourceValue);
        config.sources[sourceId] = sourceConfig;
    }
    if (Array.isArray(value.sourceInstances)) {
        for (const sourceValue of value.sourceInstances) {
            if (!isObject(sourceValue) ||
                typeof sourceValue.connectorId !== "string") {
                continue;
            }
            if (!isKnownConnectorId(sourceValue.connectorId)) {
                continue;
            }
            const id = typeof sourceValue.id === "string" && sourceValue.id.trim().length > 0
                ? sourceValue.id
                : createSourceInstanceId(sourceValue.connectorId, config.sourceInstances.length);
            config.sourceInstances.push({
                ...normalizeSourceConfig(sourceValue),
                connectorId: sourceValue.connectorId,
                id,
                name: typeof sourceValue.name === "string" ? sourceValue.name : undefined,
            });
        }
    }
    if (config.sourceInstances.length === 0) {
        for (const [connectorId, sourceConfig] of Object.entries(config.sources)) {
            if (!isKnownConnectorId(connectorId) || !sourceConfig) {
                continue;
            }
            config.sourceInstances.push({
                ...sourceConfig,
                connectorId,
                id: connectorId,
            });
        }
    }
    if (!config.ingestionSchedule) {
        config.ingestionSchedule = config.sourceInstances.find((sourceConfig) => sourceConfig.schedule)?.schedule;
    }
    config.sourceInstances = config.sourceInstances.map((sourceConfig) => {
        const nextSourceConfig = { ...sourceConfig };
        delete nextSourceConfig.schedule;
        return nextSourceConfig;
    });
    config.sources = deriveLegacySources(config.sourceInstances);
    return config;
}
function isCodeModeConfig(config) {
    return (config.modeId ?? config.templateId) === "code";
}
function normalizeSourceConfig(value) {
    return {
        connectedAt: typeof value.connectedAt === "string" ? value.connectedAt : undefined,
        connectorConfig: isObject(value.connectorConfig)
            ? value.connectorConfig
            : undefined,
        ingestionGoal: typeof value.ingestionGoal === "string" ? value.ingestionGoal : undefined,
        schedule: isObject(value.schedule)
            ? normalizeSourceScheduleConfig(value.schedule)
            : undefined,
    };
}
function normalizeSourceScheduleConfig(value) {
    return {
        description: typeof value.description === "string" ? value.description : "",
        expression: typeof value.expression === "string" ? value.expression : "",
        launchAgentPath: typeof value.launchAgentPath === "string"
            ? value.launchAgentPath
            : undefined,
        pausedAt: typeof value.pausedAt === "string" ? value.pausedAt : undefined,
        updatedAt: typeof value.updatedAt === "string"
            ? value.updatedAt
            : new Date(0).toISOString(),
        warning: typeof value.warning === "string" ? value.warning : undefined,
    };
}
function deriveLegacySources(sourceInstances) {
    const sources = {};
    for (const sourceInstance of sourceInstances) {
        if (!sources[sourceInstance.connectorId]) {
            sources[sourceInstance.connectorId] = {
                connectedAt: sourceInstance.connectedAt,
                connectorConfig: sourceInstance.connectorConfig,
                ingestionGoal: sourceInstance.ingestionGoal,
            };
        }
    }
    return sources;
}
function createSourceInstanceId(connectorId, index) {
    return `${connectorId}-${index + 1}`;
}
function normalizePowerManagementConfig(value) {
    if (!isObject(value.pmset)) {
        return undefined;
    }
    return {
        pmset: {
            days: typeof value.pmset.days === "string" ? value.pmset.days : "",
            enabled: typeof value.pmset.enabled === "boolean" ? value.pmset.enabled : false,
            sleepTime: typeof value.pmset.sleepTime === "string" ? value.pmset.sleepTime : "",
            updatedAt: typeof value.pmset.updatedAt === "string"
                ? value.pmset.updatedAt
                : new Date(0).toISOString(),
            wakeTime: typeof value.pmset.wakeTime === "string" ? value.pmset.wakeTime : "",
            warning: typeof value.pmset.warning === "string"
                ? value.pmset.warning
                : undefined,
        },
    };
}
function isKnownConnectorId(value) {
    return (value === "custom-mcp" ||
        value === "git-repo" ||
        value === "google" ||
        value === "hackernews" ||
        value === "notion" ||
        value === "slack" ||
        value === "web-search" ||
        value === "x");
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isFileNotFoundError(error) {
    return (error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT");
}
