import { lstat, readFile, readdir, realpath, rm, rmdir, } from "node:fs/promises";
import path from "node:path";
import { HostIntegrationError } from "../core/errors.js";
import { resolveRepositoryRoot } from "../core/repository-root.js";
import { writeTextAtomic } from "./atomic-file.js";
/**
 * Resolves canonical transaction paths and rejects symlinked components.
 *
 * @param target - Registry entry supplying scope-relative destinations.
 * @param scope - User or project ownership scope.
 * @param candidateRoot - Home or project root anchoring the scope.
 * @returns Canonical scope, skill, and config paths.
 */
export async function resolveInstallContext(target, scope, candidateRoot) {
    const destinations = target[scope];
    if (!destinations) {
        throw new HostIntegrationError("invalid_input", `${target.displayName} supports project-scoped integrations only. Re-run with --project.`);
    }
    const root = scope === "project"
        ? await resolveRepositoryRoot(path.resolve(candidateRoot))
        : await resolveInstallRoot(candidateRoot);
    const skillDirectory = resolveInside(root, destinations.skillDirectory, "skill directory");
    const mcpConfig = resolveInside(root, destinations.mcpConfig.relativePath, "MCP config");
    await assertNoSymlinkComponents(root, skillDirectory);
    await assertNoSymlinkComponents(root, mcpConfig);
    return {
        scope,
        root,
        skillDirectory,
        mcpConfig,
        mcpConfigKind: destinations.mcpConfig.kind,
    };
}
/**
 * Rejects symbolic links in every existing destination component.
 *
 * @param root - Canonical installation root.
 * @param destination - Contained absolute destination path.
 */
export async function assertNoSymlinkComponents(root, destination) {
    const parts = path.relative(root, destination).split(path.sep);
    let current = root;
    for (const [index, part] of parts.entries()) {
        current = path.join(current, part);
        try {
            const entry = await lstat(current);
            if (entry.isSymbolicLink()) {
                throw new HostIntegrationError("invalid_input", "Host integration destinations must not contain symbolic links.");
            }
            if (index < parts.length - 1 && !entry.isDirectory()) {
                throw new HostIntegrationError("invalid_input", "A host integration destination parent is not a directory.");
            }
        }
        catch (error) {
            if (error.code === "ENOENT")
                return;
            throw error;
        }
    }
}
/**
 * Snapshots an optional UTF-8 config before a transaction.
 *
 * @param filePath - Absolute config path.
 * @returns Exact content or an absence marker.
 */
export async function snapshotTextFile(filePath) {
    try {
        return { existed: true, content: await readFile(filePath, "utf8") };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return { existed: false };
        }
        throw error;
    }
}
/**
 * Restores an exact config snapshot after a pre-commit failure.
 *
 * @param filePath - Absolute config path.
 * @param snapshot - Pre-mutation bytes or absence marker.
 */
export async function restoreTextFile(filePath, snapshot) {
    if (snapshot.existed) {
        await writeTextAtomic(filePath, snapshot.content ?? "");
    }
    else {
        await rm(filePath, { force: true });
    }
}
/**
 * Produces one private sibling transaction path.
 *
 * @param destination - Managed skill destination.
 * @param purpose - Transaction path purpose.
 * @param id - Collision-resistant identifier.
 * @returns Absolute private sibling path.
 */
export function siblingPath(destination, purpose, id) {
    return path.join(path.dirname(destination), `.${path.basename(destination)}.openwiki-${purpose}-${id}`);
}
/**
 * Produces one retained, timestamped forced-replacement backup path.
 *
 * @param destination - Managed skill destination.
 * @param now - Backup timestamp.
 * @param id - Collision-resistant identifier.
 * @returns Absolute retained sibling backup path.
 */
export function forcedBackupPath(destination, now, id) {
    const timestamp = now.toISOString().replace(/[:.]/gu, "-");
    return path.join(path.dirname(destination), `${path.basename(destination)}.openwiki-backup-${timestamp}-${id}`);
}
/**
 * Removes empty skill ancestors without deleting host-owned root directories.
 *
 * @param root - Canonical installation root.
 * @param skillDirectory - Removed managed skill path.
 */
export async function removeEmptySkillParents(root, skillDirectory) {
    const [hostDirectory] = path.relative(root, skillDirectory).split(path.sep);
    const protectedHostPath = path.join(root, hostDirectory ?? "");
    let current = path.dirname(skillDirectory);
    while (current !== root &&
        current.startsWith(`${root}${path.sep}`) &&
        current !== protectedHostPath) {
        if ((await readdir(current)).length > 0)
            return;
        await rmdir(current);
        current = path.dirname(current);
    }
}
/**
 * Creates one stable public result object.
 *
 * @param target - Affected registry target.
 * @param context - Canonical scope paths.
 * @param changed - Whether managed state changed.
 * @param backupPath - Optional retained sibling backup.
 * @returns Public installation result.
 */
export function resultFor(target, context, changed, backupPath) {
    return {
        target: target.id,
        scope: context.scope,
        skillDirectory: context.skillDirectory,
        mcpConfig: context.mcpConfig,
        changed,
        ...(backupPath ? { backupPath } : {}),
    };
}
/**
 * Resolves and validates one existing installation root.
 *
 * @param candidate - User-supplied home or project root.
 * @returns Canonical absolute directory path.
 */
async function resolveInstallRoot(candidate) {
    try {
        const root = await realpath(candidate);
        if (!(await lstat(root)).isDirectory()) {
            throw new HostIntegrationError("invalid_input", "The integration scope root must be a directory.");
        }
        return root;
    }
    catch (error) {
        if (error instanceof HostIntegrationError)
            throw error;
        throw new HostIntegrationError("invalid_input", "The integration scope root must be an existing directory.");
    }
}
/**
 * Resolves a trusted registry path while enforcing scope containment.
 *
 * @param root - Canonical installation root.
 * @param relativePath - Registry-owned relative destination.
 * @param label - Destination label used in safe validation errors.
 * @returns Absolute contained destination path.
 */
function resolveInside(root, relativePath, label) {
    if (path.isAbsolute(relativePath)) {
        throw new HostIntegrationError("invalid_input", `The host ${label} must be scope-relative.`);
    }
    const resolved = path.resolve(root, relativePath);
    if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
        throw new HostIntegrationError("invalid_input", `The host ${label} must stay inside the scope root.`);
    }
    return resolved;
}
