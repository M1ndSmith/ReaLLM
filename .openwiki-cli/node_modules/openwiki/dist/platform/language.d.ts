/**
 * Outcome of classifying a user-supplied output-language string.
 *
 * The unrecognized case stays distinct from the absent one so no caller can
 * quietly treat a typo as "no language requested". Collapsing the two resolves
 * a misspelled flag to English and records English in run state, which a later
 * run is then refused permission to change.
 */
export type ResolvedLanguage = {
    kind: "absent";
} | {
    kind: "resolved";
    language: string;
} | {
    kind: "unrecognized";
    input: string;
    message: string;
};
/**
 * Classifies an output-language flag using only the built-in Intl APIs, so no
 * dependency is added.
 *
 * getCanonicalLocales rejects malformed tags (wrong length, digits,
 * underscores, non-ASCII) by throwing, and DisplayNames distinguishes
 * recognized codes from structurally valid but unknown ones (for example "xx"
 * or "korean", which BCP-47 permits as a 5-8 letter subtag but has never
 * registered) by echoing the input back instead of returning a real language
 * name.
 */
export declare function resolveLanguage(input: string | null | undefined): ResolvedLanguage;
/**
 * Requires the canonical tag for a request an entry point already validated.
 *
 * Every entry point that accepts a language rejects an unrecognized one before
 * any work starts, so an unrecognized value here means a boundary check was
 * skipped. That is a programming error rather than user input, and it throws
 * instead of resolving to English.
 */
export declare function requireResolvedLanguage(input: string | null | undefined): string | undefined;
/**
 * Returns a language tag's primary subtag (for example `zh` for `zh-CN`),
 * treating an absent tag as English. Malformed persisted values are returned as
 * written so they cannot accidentally compare equal to a valid requested tag.
 */
export declare function getPrimaryLanguageSubtag(tag: string | null | undefined): string;
