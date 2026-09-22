import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { OPEN_WIKI_DIR } from "../config/constants.js";
import { isFileNotFoundError } from "../platform/fs-errors.js";
import { RepositoryRunError } from "./errors.js";
/**
 * Basename of the one durable repository-generation checkpoint.
 */
export const REPOSITORY_RUN_STATE_BASENAME = ".run.json";
/**
 * Current on-disk repository-run schema version.
 */
export const REPOSITORY_RUN_STATE_SCHEMA_VERSION = 1;
const UpdateMetadataSchema = z
    .object({
    updatedAt: z.string(),
    command: z.enum(["init", "update"]),
    gitHead: z.string().optional(),
    model: z.string(),
    status: z.enum(["complete", "interrupted"]),
    language: z.string().optional(),
})
    .strict();
const PersistedPreparedWikiStateSchema = z
    .object({
    generatedProvenance: z.array(z
        .object({
        page: z.string().min(1),
        bodyHash: z.string().min(1),
        generated: z
            .object({
            by: z.string().min(1),
            at: z.string().min(1).optional(),
        })
            .strict()
            .optional(),
    })
        .strict()),
})
    .strict();
const PageJobSchema = z
    .object({
    id: z.string().uuid(),
    path: z.string().min(1),
    title: z.string().trim().min(1),
    purpose: z.string().trim().min(1),
    seedPaths: z.array(z.string()),
    relatedPages: z.array(z.string()),
    instructions: z.array(z.string().trim().min(1)),
    status: z.enum(["pending", "skipped", "complete"]),
    completedBy: z.string().trim().min(1).optional(),
})
    .strict();
const RepositoryRunStateSchema = z
    .object({
    schemaVersion: z.literal(REPOSITORY_RUN_STATE_SCHEMA_VERSION),
    runId: z.string().uuid(),
    mode: z.enum(["init", "update"]),
    phase: z.enum(["planning", "generating"]),
    startedAt: z.string().min(1),
    language: z.string().min(1),
    languageChanged: z.boolean(),
    requiredRewritePages: z.array(z.string().min(1)),
    initialPages: z.array(z.string().min(1)),
    sourceFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    targetGitHead: z.string().min(1).optional(),
    planningContext: z.string().min(1).optional(),
    actor: z
        .object({
        producerActor: z.string().trim().min(1),
        metadataModel: z.string().trim().min(1),
    })
        .strict(),
    previousLastUpdate: UpdateMetadataSchema.nullable(),
    baseGitHead: z.string().min(1).optional(),
    wikiGoal: z.string().optional(),
    beforeContentSnapshot: z.string(),
    preparedWiki: PersistedPreparedWikiStateSchema,
    plan: z
        .object({
        pages: z.array(PageJobSchema),
        deletePages: z.array(z.string()),
    })
        .strict()
        .optional(),
})
    .strict();
/**
 * Resolves the checkpoint path below an absolute repository root.
 */
export function repositoryRunStatePath(root) {
    return path.join(root, OPEN_WIKI_DIR, REPOSITORY_RUN_STATE_BASENAME);
}
/**
 * Loads and validates resumable state.
 *
 * @returns Valid state, or `null` when no checkpoint exists.
 * @throws RepositoryRunError when the checkpoint is malformed.
 */
export async function readRepositoryRunState(root) {
    const file = repositoryRunStatePath(root);
    try {
        const parsed = JSON.parse(await readFile(file, "utf8"));
        return RepositoryRunStateSchema.parse(parsed);
    }
    catch (error) {
        if (isFileNotFoundError(error))
            return null;
        if (error instanceof SyntaxError || error instanceof z.ZodError) {
            throw new RepositoryRunError("invalid_state", `OpenWiki run state is malformed at ${file}; refusing to discard resumable work.`);
        }
        throw error;
    }
}
/**
 * Atomically replaces the complete repository-generation checkpoint.
 *
 * @throws Error when validation or filesystem persistence fails.
 */
export async function writeRepositoryRunState(root, state) {
    RepositoryRunStateSchema.parse(state);
    const file = repositoryRunStatePath(root);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
            encoding: "utf8",
            flag: "wx",
        });
        await rename(temporary, file);
    }
    finally {
        await rm(temporary, { force: true }).catch(() => undefined);
    }
}
/**
 * Idempotently removes the checkpoint after completion or init rollback.
 */
export async function removeRepositoryRunState(root) {
    await rm(repositoryRunStatePath(root), { force: true });
}
