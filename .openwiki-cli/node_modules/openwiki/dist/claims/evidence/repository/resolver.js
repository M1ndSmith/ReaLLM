import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { OpenWikiIgnore } from "../../../agent/openwiki-ignore.js";
import { EvidenceResolutionError, EvidenceResourceError, EvidenceSecurityError, } from "../../core/errors.js";
import { formatRepositoryEvidenceResource, parseRepositoryEvidenceResource, } from "./resource.js";
/**
 * Maximum number of complete lines used as context on each side of a range.
 */
const RANGE_CONTEXT_LINE_COUNT = 3;
/**
 * Prefix for line-range versions carrying resolver-owned relocation metadata.
 */
const LINE_RANGE_VERSION_PREFIX = "repo-lines-v1:sha256:";
/**
 * Exact number of fields in serialized line-range relocation metadata.
 */
const LINE_RANGE_VERSION_METADATA_FIELD_COUNT = 7;
/**
 * Resolves and versions `repo://` evidence without model involvement.
 */
export class RepositoryEvidenceResolver {
    /**
     * Absolute repository root.
     */
    rootDir;
    /**
     * Lazily resolved physical repository root.
     *
     * @default undefined until the first existing evidence file is resolved.
     */
    realRootDirPromise;
    /**
     * Repository read-boundary rules.
     */
    openWikiIgnore;
    constructor(options) {
        if (!path.isAbsolute(options.rootDir)) {
            throw new EvidenceResourceError("Repository evidence root must be absolute.");
        }
        this.rootDir = path.resolve(options.rootDir);
        this.openWikiIgnore = options.openWikiIgnore ?? new OpenWikiIgnore([]);
    }
    /**
     * Resolves the current line range or whole-file representation.
     *
     * @param resource - Canonical `repo://` resource.
     * @param previousVersion - Prior opaque version used to relocate a range.
     * @returns Current evidence, or `null` when the file/range no longer exists.
     */
    async resolve(resource, previousVersion) {
        const parsed = parseRepositoryEvidenceResource(resource);
        const canonicalResource = formatRepositoryEvidenceResource(parsed);
        if (this.openWikiIgnore.ignores(parsed.path)) {
            throw new EvidenceResourceError(`Evidence path is excluded by .openwikiignore: ${parsed.path}`);
        }
        const absolutePath = this.resolveSafePath(parsed.path);
        let source;
        try {
            const metadata = await lstat(absolutePath);
            if (metadata.isSymbolicLink()) {
                throw new EvidenceSecurityError(`Evidence cannot reference a symbolic link: ${parsed.path}`);
            }
            if (!metadata.isFile()) {
                return null;
            }
            const realRootDir = await this.getRealRootDir();
            const physicalPath = await realpath(absolutePath);
            const expectedPhysicalPath = path.resolve(realRootDir, parsed.path);
            if (!isPathInside(realRootDir, physicalPath) ||
                physicalPath !== expectedPhysicalPath) {
                throw new EvidenceSecurityError(`Evidence path traverses a symbolic link or filesystem alias: ${parsed.path}`);
            }
            source = await readFile(physicalPath, "utf8");
        }
        catch (error) {
            if (isMissingFileError(error)) {
                return null;
            }
            if (error instanceof EvidenceResolutionError) {
                throw error;
            }
            throw new EvidenceResolutionError(`Unable to read evidence ${parsed.path}: ${toErrorMessage(error)}`);
        }
        if (!parsed.range) {
            return createWholeFileEvidence(canonicalResource, source);
        }
        return resolveLineRangeEvidence({
            resource: canonicalResource,
            source,
            startLine: parsed.range.startLine,
            endLine: parsed.range.endLine,
            previousVersion,
        });
    }
    /**
     * Resolves a repository-relative path while enforcing root containment.
     *
     * @param relativePath - Normalized repository-relative POSIX path.
     * @returns Absolute contained filesystem path.
     */
    resolveSafePath(relativePath) {
        const absolutePath = path.resolve(this.rootDir, relativePath);
        const relative = path.relative(this.rootDir, absolutePath);
        if (relative === ".." ||
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)) {
            throw new EvidenceResourceError(`Evidence path escapes the repository: ${relativePath}`);
        }
        return absolutePath;
    }
    /**
     * Resolves and caches the physical repository root for symlink checks.
     *
     * @returns Canonical filesystem path for the repository root.
     */
    async getRealRootDir() {
        this.realRootDirPromise ??= realpath(this.rootDir).catch((error) => {
            throw new EvidenceSecurityError(`Unable to resolve repository root ${this.rootDir}: ${toErrorMessage(error)}`);
        });
        return this.realRootDirPromise;
    }
}
/**
 * Resolves a language-agnostic line range, using hashed anchors from its prior
 * opaque version when edits moved or resized the selected source.
 *
 * @param input - Current source, requested range, and optional prior version.
 * @returns Current range evidence, or `null` when it cannot be located safely.
 */
function resolveLineRangeEvidence(input) {
    const lines = splitSourceLines(input.source);
    const hintedSpan = toSourceLineSpan(input.startLine, input.endLine, lines.length);
    const previousVersion = input.previousVersion;
    const parsedPreviousVersion = parseLineRangeVersion(previousVersion);
    if (!parsedPreviousVersion || !previousVersion) {
        return hintedSpan
            ? createLineRangeEvidence(input.resource, lines, hintedSpan)
            : null;
    }
    const unchangedSpan = locateUnchangedLineRange(lines, hintedSpan, parsedPreviousVersion);
    if (unchangedSpan) {
        return {
            evidence: {
                resource: input.resource,
                version: previousVersion,
            },
            content: getLineRangeContent(lines, unchangedSpan),
        };
    }
    const changedSpan = locateChangedLineRange(lines, parsedPreviousVersion.metadata);
    return changedSpan
        ? createLineRangeEvidence(input.resource, lines, changedSpan)
        : null;
}
/**
 * Splits source into exact lines, retaining line terminators in range content.
 * A terminal newline does not create a phantom additional source line.
 *
 * @param source - Complete source text.
 * @returns Exact source lines in order.
 */
function splitSourceLines(source) {
    const lines = [];
    let start = 0;
    while (start < source.length) {
        const newline = source.indexOf("\n", start);
        const end = newline === -1 ? source.length : newline + 1;
        lines.push(source.slice(start, end));
        start = end;
    }
    return lines;
}
/**
 * Converts an inclusive one-based range to zero-based half-open indexes.
 *
 * @param startLine - First requested source line.
 * @param endLine - Last requested source line.
 * @param lineCount - Current source line count.
 * @returns Current indexes, or `null` when the request is out of bounds.
 */
function toSourceLineSpan(startLine, endLine, lineCount) {
    return endLine <= lineCount
        ? { startIndex: startLine - 1, endIndexExclusive: endLine }
        : null;
}
/**
 * Creates current evidence and relocation metadata for one selected range.
 *
 * @param resource - Canonical repository resource.
 * @param lines - Exact current source lines.
 * @param span - Selected current line span.
 * @returns Persistable range evidence.
 */
function createLineRangeEvidence(resource, lines, span) {
    const content = getLineRangeContent(lines, span);
    return {
        evidence: {
            resource,
            version: formatLineRangeVersion(content, lines, span),
        },
        content,
    };
}
/**
 * Locates unchanged selected text at its original hint or elsewhere in a file.
 *
 * @param lines - Exact current source lines.
 * @param hintedSpan - Current location implied by the persisted URI.
 * @param previousVersion - Parsed prior content fingerprint and relocation anchors.
 * @returns Unique unchanged range, or `null`.
 */
function locateUnchangedLineRange(lines, hintedSpan, previousVersion) {
    const { metadata } = previousVersion;
    if (hintedSpan &&
        hintedSpan.endIndexExclusive - hintedSpan.startIndex ===
            metadata.selectedLineCount &&
        hashText(getLineRangeContent(lines, hintedSpan)) ===
            previousVersion.contentHash) {
        return hintedSpan;
    }
    const matchingSpans = [];
    const lineHashes = lines.map((line) => hashText(line));
    for (let startIndex = 0; startIndex + metadata.selectedLineCount <= lines.length; startIndex += 1) {
        const endIndexExclusive = startIndex + metadata.selectedLineCount;
        if (lineHashes[startIndex] !== metadata.firstSelectedLineHash ||
            lineHashes[endIndexExclusive - 1] !== metadata.lastSelectedLineHash) {
            continue;
        }
        const candidateSpan = { startIndex, endIndexExclusive };
        if (hashText(getLineRangeContent(lines, candidateSpan)) ===
            previousVersion.contentHash) {
            matchingSpans.push(candidateSpan);
        }
    }
    if (matchingSpans.length === 1) {
        return matchingSpans[0];
    }
    const contextMatches = matchingSpans.filter((candidate) => hasMatchingRangeContext(lines, candidate, metadata));
    return contextMatches.length === 1 ? contextMatches[0] : null;
}
/**
 * Relocates changed selected text between its unchanged exterior anchors.
 * Ambiguous anchor pairs deliberately resolve to `null`.
 *
 * @param lines - Exact current source lines.
 * @param metadata - Prior relocation metadata.
 * @returns Unique non-empty current range, or `null`.
 */
function locateChangedLineRange(lines, metadata) {
    const startIndexes = findContextBoundaries(lines, metadata.precedingContextLineCount, metadata.precedingContextHash, "before");
    const endIndexesExclusive = findContextBoundaries(lines, metadata.followingContextLineCount, metadata.followingContextHash, "after");
    const candidateSpans = [];
    for (const startIndex of startIndexes) {
        for (const endIndexExclusive of endIndexesExclusive) {
            if (endIndexExclusive > startIndex) {
                candidateSpans.push({ startIndex, endIndexExclusive });
                if (candidateSpans.length > 1) {
                    return null;
                }
            }
        }
    }
    return candidateSpans[0] ?? null;
}
/**
 * Finds selection boundaries immediately after or before a context window.
 *
 * @param lines - Exact current source lines.
 * @param contextLineCount - Number of lines in the prior context.
 * @param contextHash - Hash of the prior context.
 * @param side - Whether matches precede or follow the selected range.
 * @returns Candidate zero-based selection boundaries.
 */
function findContextBoundaries(lines, contextLineCount, contextHash, side) {
    if (contextLineCount === 0) {
        return [side === "before" ? 0 : lines.length];
    }
    const boundaryIndexes = [];
    for (let contextStartIndex = 0; contextStartIndex + contextLineCount <= lines.length; contextStartIndex += 1) {
        if (hashText(lines
            .slice(contextStartIndex, contextStartIndex + contextLineCount)
            .join("")) === contextHash) {
            boundaryIndexes.push(side === "before"
                ? contextStartIndex + contextLineCount
                : contextStartIndex);
        }
    }
    return boundaryIndexes;
}
/**
 * Checks whether a candidate still has both prior exterior anchors.
 *
 * @param lines - Exact current source lines.
 * @param span - Candidate unchanged line span.
 * @param metadata - Prior relocation metadata.
 * @returns Whether both anchors still surround the candidate.
 */
function hasMatchingRangeContext(lines, span, metadata) {
    const precedingContextMatches = metadata.precedingContextLineCount === 0
        ? span.startIndex === 0
        : span.startIndex >= metadata.precedingContextLineCount &&
            hashText(lines
                .slice(span.startIndex - metadata.precedingContextLineCount, span.startIndex)
                .join("")) === metadata.precedingContextHash;
    const followingContextMatches = metadata.followingContextLineCount === 0
        ? span.endIndexExclusive === lines.length
        : span.endIndexExclusive + metadata.followingContextLineCount <=
            lines.length &&
            hashText(lines
                .slice(span.endIndexExclusive, span.endIndexExclusive + metadata.followingContextLineCount)
                .join("")) === metadata.followingContextHash;
    return precedingContextMatches && followingContextMatches;
}
/**
 * Extracts exact source text for a line range.
 *
 * @param lines - Exact source lines.
 * @param span - Selected line indexes.
 * @returns Exact source text represented by the selected lines.
 */
function getLineRangeContent(lines, span) {
    return lines.slice(span.startIndex, span.endIndexExclusive).join("");
}
/**
 * Formats a range content hash plus relocation metadata.
 *
 * @param content - Exact selected text.
 * @param lines - Exact complete source lines.
 * @param span - Selected current line span.
 * @returns Opaque persistable evidence version.
 */
function formatLineRangeVersion(content, lines, span) {
    const precedingContextStartIndex = Math.max(0, span.startIndex - RANGE_CONTEXT_LINE_COUNT);
    const followingContextEndIndexExclusive = Math.min(lines.length, span.endIndexExclusive + RANGE_CONTEXT_LINE_COUNT);
    const metadata = {
        selectedLineCount: span.endIndexExclusive - span.startIndex,
        firstSelectedLineHash: hashText(lines[span.startIndex]),
        lastSelectedLineHash: hashText(lines[span.endIndexExclusive - 1]),
        precedingContextLineCount: span.startIndex - precedingContextStartIndex,
        precedingContextHash: hashText(lines.slice(precedingContextStartIndex, span.startIndex).join("")),
        followingContextLineCount: followingContextEndIndexExclusive - span.endIndexExclusive,
        followingContextHash: hashText(lines
            .slice(span.endIndexExclusive, followingContextEndIndexExclusive)
            .join("")),
    };
    const encoded = Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
    return `${LINE_RANGE_VERSION_PREFIX}${hashText(content)}:${encoded}`;
}
/**
 * Parses and validates prior range relocation metadata.
 * Unknown version algorithms intentionally fall back to the URI's line hint.
 *
 * @param value - Optional prior evidence version.
 * @returns Validated range version, or `null`.
 */
function parseLineRangeVersion(value) {
    if (!value?.startsWith(LINE_RANGE_VERSION_PREFIX)) {
        return null;
    }
    const versionBody = value.slice(LINE_RANGE_VERSION_PREFIX.length);
    const metadataSeparatorIndex = versionBody.indexOf(":");
    if (metadataSeparatorIndex === -1) {
        return null;
    }
    const contentHash = versionBody.slice(0, metadataSeparatorIndex);
    if (!isSha256Hash(contentHash)) {
        return null;
    }
    try {
        const decodedMetadata = JSON.parse(Buffer.from(versionBody.slice(metadataSeparatorIndex + 1), "base64url").toString("utf8"));
        if (!isLineRangeVersionMetadata(decodedMetadata)) {
            return null;
        }
        return { contentHash, metadata: decodedMetadata };
    }
    catch {
        return null;
    }
}
/**
 * Validates decoded range relocation metadata strictly.
 *
 * @param value - Unknown decoded JSON.
 * @returns Whether the value is safe relocation metadata.
 */
function isLineRangeVersionMetadata(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value;
    return (Object.keys(record).length === LINE_RANGE_VERSION_METADATA_FIELD_COUNT &&
        isSafeIntegerInRange(record.selectedLineCount, 1, Number.MAX_SAFE_INTEGER) &&
        isSafeIntegerInRange(record.precedingContextLineCount, 0, RANGE_CONTEXT_LINE_COUNT) &&
        isSafeIntegerInRange(record.followingContextLineCount, 0, RANGE_CONTEXT_LINE_COUNT) &&
        isSha256Hash(record.firstSelectedLineHash) &&
        isSha256Hash(record.lastSelectedLineHash) &&
        isSha256Hash(record.precedingContextHash) &&
        isSha256Hash(record.followingContextHash));
}
/**
 * Checks whether a value is a safe integer inside an inclusive range.
 *
 * @param value - Unknown candidate value.
 * @param minimum - Smallest accepted integer.
 * @param maximum - Largest accepted integer.
 * @returns Whether the value is a safe integer inside the requested range.
 */
function isSafeIntegerInRange(value, minimum, maximum) {
    return (typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= minimum &&
        value <= maximum);
}
/**
 * Creates explicit whole-file evidence.
 *
 * @param resource - Canonical whole-file repository resource.
 * @param source - Complete source text.
 * @returns Whole-file-backed resolved evidence.
 */
function createWholeFileEvidence(resource, source) {
    return {
        evidence: {
            resource,
            version: createHashedVersion("repo-file-v1", source),
        },
        content: source,
    };
}
/**
 * Determines whether a physical path remains inside a physical root.
 *
 * @param rootDir - Canonical root directory.
 * @param candidate - Canonical candidate path.
 * @returns Whether the candidate is contained by the root.
 */
function isPathInside(rootDir, candidate) {
    const relative = path.relative(rootDir, candidate);
    return (relative.length > 0 &&
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative));
}
/**
 * Creates an algorithm-prefixed SHA-256 evidence version.
 *
 * @param algorithm - Stable resolver algorithm identifier.
 * @param content - Exact content to hash.
 * @returns Persistable opaque evidence version.
 */
function createHashedVersion(algorithm, content) {
    return `${algorithm}:sha256:${hashText(content)}`;
}
/**
 * Hashes exact text with SHA-256.
 *
 * @param content - Text to fingerprint.
 * @returns Lowercase hexadecimal digest.
 */
function hashText(content) {
    return createHash("sha256").update(content).digest("hex");
}
/**
 * Validates one SHA-256 hexadecimal digest.
 *
 * @param value - Unknown candidate digest.
 * @returns Whether the value is a canonical digest.
 */
function isSha256Hash(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}
/**
 * Determines whether a filesystem error means the evidence disappeared.
 *
 * @param error - Unknown filesystem failure.
 * @returns Whether the error represents a missing path.
 */
function isMissingFileError(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT");
}
/**
 * Converts an unknown error into diagnostic text.
 *
 * @param error - Unknown thrown value.
 * @returns Human-readable error detail.
 */
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
