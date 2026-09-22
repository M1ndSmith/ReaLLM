import { chmod, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { restrictDirToCurrentUser } from "../platform/windows-acl.js";
export const OPENWIKI_CONFIG_DIR_ENV_KEY = "OPENWIKI_CONFIG_DIR";
export function resolveOpenWikiHomeDir(environment = process.env) {
    const configuredDir = environment[OPENWIKI_CONFIG_DIR_ENV_KEY]?.trim();
    if (!configuredDir) {
        return path.join(os.homedir(), ".openwiki");
    }
    // `path.resolve` does not expand a leading `~`, and several environments
    // that set env vars (PowerShell, docker-compose, a hand-edited `.env`) leave
    // it literal. Mirror the tilde handling used by `normalizeLocalPath`.
    if (configuredDir === "~") {
        return path.join(os.homedir());
    }
    if (configuredDir.startsWith("~/") || configuredDir.startsWith("~\\")) {
        return path.resolve(os.homedir(), configuredDir.slice(2));
    }
    return path.resolve(configuredDir);
}
export function getOpenWikiHomeDisplayPath(environment = process.env) {
    return environment[OPENWIKI_CONFIG_DIR_ENV_KEY]?.trim()
        ? resolveOpenWikiHomeDir(environment)
        : "~/.openwiki";
}
export const openWikiHomeDir = resolveOpenWikiHomeDir();
export const openWikiHomeDisplayPath = getOpenWikiHomeDisplayPath();
export const openWikiConnectorsDir = path.join(openWikiHomeDir, "connectors");
export const openWikiConversationHistoryDir = path.join(openWikiHomeDir, "conversation_history");
export const openWikiLocalWikiDir = path.join(openWikiHomeDir, "wiki");
export const openWikiSkillsDir = path.join(openWikiHomeDir, "skills");
export const openWikiConnectorsDisplayPath = `${openWikiHomeDisplayPath}/connectors`;
export const openWikiLocalWikiDisplayPath = `${openWikiHomeDisplayPath}/wiki`;
export const openWikiSkillsDisplayPath = `${openWikiHomeDisplayPath}/skills`;
export const openWikiEnvDisplayPath = `${openWikiHomeDisplayPath}/.env`;
export function getConnectorDir(connectorId) {
    return path.join(openWikiConnectorsDir, connectorId);
}
export function getConnectorConfigPath(connectorId) {
    return path.join(getConnectorDir(connectorId), "config.json");
}
export function getConnectorStatePath(connectorId) {
    return path.join(getConnectorDir(connectorId), "state.json");
}
export function getConnectorRawDir(connectorId) {
    return path.join(getConnectorDir(connectorId), "raw");
}
export function getConnectorLogsDir(connectorId) {
    return path.join(getConnectorDir(connectorId), "logs");
}
export async function ensureOpenWikiHome() {
    await mkdir(openWikiHomeDir, { recursive: true, mode: 0o700 });
    await chmodIfExists(openWikiHomeDir, 0o700);
    await restrictDirToCurrentUser(openWikiHomeDir);
    await mkdir(openWikiConnectorsDir, { recursive: true, mode: 0o700 });
    await mkdir(openWikiConversationHistoryDir, { recursive: true, mode: 0o700 });
    await mkdir(openWikiLocalWikiDir, { recursive: true, mode: 0o700 });
    await mkdir(openWikiSkillsDir, { recursive: true, mode: 0o700 });
}
export async function ensureConnectorHome(connectorId) {
    assertSafeConnectorId(connectorId);
    await ensureOpenWikiHome();
    await mkdir(getConnectorDir(connectorId), { recursive: true, mode: 0o700 });
    await mkdir(getConnectorRawDir(connectorId), {
        recursive: true,
        mode: 0o700,
    });
    await mkdir(getConnectorLogsDir(connectorId), {
        recursive: true,
        mode: 0o700,
    });
}
export function assertSafeConnectorId(connectorId) {
    if (!/^[a-z][a-z0-9-]{0,63}$/u.test(connectorId)) {
        throw new Error(`Invalid connector ID: ${connectorId}`);
    }
}
export function resolveConnectorRawPath(connectorId, relativePath) {
    assertSafeConnectorId(connectorId);
    const rawDir = getConnectorRawDir(connectorId);
    const resolved = path.resolve(rawDir, relativePath);
    if (resolved !== rawDir && !resolved.startsWith(`${rawDir}${path.sep}`)) {
        throw new Error("Raw item path must stay inside the connector raw directory.");
    }
    return resolved;
}
async function chmodIfExists(filePath, mode) {
    try {
        await chmod(filePath, mode);
    }
    catch (error) {
        if (!isFileNotFoundError(error)) {
            throw error;
        }
    }
}
function isFileNotFoundError(error) {
    return (error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT");
}
