import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureConnectorHome, getConnectorConfigPath, getConnectorRawDir, getConnectorStatePath, } from "../config/openwiki-home.js";
export async function readConnectorConfig(connectorId, defaultConfig) {
    await ensureConnectorHome(connectorId);
    try {
        return {
            ...defaultConfig,
            ...JSON.parse(await readFile(getConnectorConfigPath(connectorId), "utf8")),
        };
    }
    catch (error) {
        if (isFileNotFoundError(error)) {
            return defaultConfig;
        }
        throw error;
    }
}
export async function readConnectorState(connectorId) {
    await ensureConnectorHome(connectorId);
    try {
        return JSON.parse(await readFile(getConnectorStatePath(connectorId), "utf8"));
    }
    catch (error) {
        if (isFileNotFoundError(error)) {
            return { version: 1 };
        }
        throw error;
    }
}
export async function writeConnectorState(connectorId, state) {
    await ensureConnectorHome(connectorId);
    await writePrivateJson(getConnectorStatePath(connectorId), state);
}
export async function writeRawJson(connectorId, runId, filename, value) {
    await ensureConnectorHome(connectorId);
    const filePath = path.join(getConnectorRawDir(connectorId), runId, filename);
    await writePrivateJson(filePath, value);
    return filePath;
}
export function createRunId() {
    return new Date().toISOString().replace(/[:.]/gu, "-");
}
export function updateStateWithRun(state, run) {
    return {
        ...state,
        lastRunAt: run.at,
        runs: [run, ...(state.runs ?? [])].slice(0, 20),
        version: 1,
    };
}
async function writePrivateJson(filePath, value) {
    await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 }));
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    await chmod(filePath, 0o600);
}
function isFileNotFoundError(error) {
    return (error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT");
}
