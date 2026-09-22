/**
 * Name of the gitignore-style file that lists paths the doc agent must not touch.
 */
export declare const OPENWIKI_IGNORE_FILE = ".openwikiignore";
/**
 * One compiled `.openwikiignore` pattern.
 *
 * A rule owns both the compiled matcher and the decision of whether a given
 * path matches it. Rules are never evaluated alone: {@link OpenWikiIgnore}
 * applies them in file order with last-match-wins semantics, which is what lets
 * a later negated (`!`) rule re-include a path an earlier rule excluded.
 */
export declare class OpenWikiIgnoreRule {
    /**
     * Compile one `.openwikiignore` pattern into a rule.
     *
     * Peels off the gitignore modifiers before building the matcher: a leading `!`
     * marks negation, a leading `/` (or embedded slash) anchors the pattern to the
     * repo root, and a trailing `/` scopes it to directories. Returns `undefined`
     * if the pattern is empty after stripping those markers.
     */
    static compile(pattern: string): OpenWikiIgnoreRule | undefined;
    /**
     * Build the regex that tests a normalized path against one pattern.
     *
     * Anchored patterns (leading `/`) and patterns that contain a slash are
     * matched from the start of the path; a trailing `(?:/.*)?` lets a directory
     * pattern also match everything nested beneath it. Unanchored, slash-free
     * patterns (e.g. `*.log`) match at any path segment via the `(^|/)` prefix.
     *
     * The `i` flag is deliberate and security-relevant: on case-insensitive
     * filesystems (macOS APFS/HFS+, Windows NTFS) `Secrets/token.txt` and
     * `secrets/token.txt` resolve to the same file, so a case-sensitive rule
     * would let an alternate-cased spelling slip past an exclusion. Matching
     * case-insensitively everywhere closes that bypass; the worst case on a
     * genuinely case-sensitive filesystem is over-excluding a case variant,
     * which is the safe direction for an access gate.
     */
    private static createMatcher;
    /**
     * Translate a gitignore-style glob into a regex source fragment.
     *
     * Supported wildcards: `**\/` spans zero or more directories, a bare `**`
     * spans anything, `*` matches within a single path segment, and `?` matches
     * one non-slash character. All other characters are escaped as literals.
     */
    private static globToRegexSource;
    /**
     * Escape a single character so it is treated literally inside a regex.
     */
    private static escapeRegex;
    /**
     * Whether the pattern only matches directories (trailing `/` in the source,
     * e.g. `build/`). Directory-only rules still match files nested under the
     * directory; see {@link matches}.
     */
    private readonly directoryOnly;
    /**
     * Compiled matcher for the glob, tested against a normalized repo-relative path.
     */
    private readonly matcher;
    /**
     * Whether the source line began with `!`, re-including a previously excluded path.
     */
    readonly negated: boolean;
    private constructor();
    /**
     * Test whether this rule matches a normalized path.
     *
     * A directory-only rule matches only when the target is itself a directory or
     * sits under one (the path contains a `/`), so `build/` never excludes a
     * top-level file literally named `build`.
     */
    matches(filePath: string, isDirectory: boolean): boolean;
}
/**
 * The full, ordered set of `.openwikiignore` rules for one run.
 *
 * This is the aggregate matcher over every rule, not a single rule:
 * {@link ignores} can only answer "is this path excluded?" by walking the rules
 * in file order, because negation (`!`) is only meaningful relative to the rules
 * that precede it. It is threaded through the agent backend, prompt, and run
 * context as one cohesive object so the matching semantics live in exactly one
 * place.
 *
 * Matching aims to be gitignore-compatible: last-match-wins, `*`/`**`/`?` globs,
 * leading-`/` anchoring to the repo root, and trailing-`/` directory scoping.
 */
export declare class OpenWikiIgnore {
    /**
     * Parse raw `.openwikiignore` file contents into an aggregate matcher.
     *
     * Splits on newlines, drops blank lines and `#` comments, and keeps the
     * remaining lines as patterns.
     */
    static parse(contents: string): OpenWikiIgnore;
    /**
     * Load and parse `.openwikiignore` from a repo root.
     *
     * A missing file is treated as "no rules" (an inactive matcher), not an error;
     * any other read failure is rethrown.
     *
     * @param cwd - Absolute path to the repository root to read the file from.
     */
    static load(cwd: string): Promise<OpenWikiIgnore>;
    /**
     * The raw, non-comment pattern lines, preserved for prompt/display purposes.
     */
    readonly patterns: string[];
    /**
     * The compiled rules, in file order; invalid/empty patterns are dropped.
     */
    private readonly rules;
    constructor(patterns: string[]);
    /**
     * Whether any usable rule was parsed. Enforcement is a no-op when this is false.
     */
    get isActive(): boolean;
    /**
     * Report whether `filePath` is excluded by the ruleset.
     *
     * The path is first canonicalized by {@link normalizeIgnorePath} so that
     * equivalent spellings (`./secrets/x`, `secrets/../secrets/x`, `/secrets/x`)
     * cannot slip past an anchored rule. Rules are then applied in file order and
     * the last matching rule wins, so a trailing `!pattern` can re-include a path.
     *
     * @param filePath - A repo-relative (or root-anchored) path to test.
     * @param isDirectory - Whether the path refers to a directory; lets
     *   directory-only rules match the directory entry itself. Defaults to false.
     */
    ignores(filePath: string, isDirectory?: boolean): boolean;
}
