/**
 * Base error for deterministic Grounded Claims failures.
 */
export declare class ClaimsError extends Error {
    constructor(message: string);
}
/**
 * Reports invalid or unsafe claim persistence state.
 */
export declare class ClaimsPersistenceError extends ClaimsError {
    constructor(message: string);
}
/**
 * Reports a generated Markdown page that disappeared before synchronization.
 */
export declare class ClaimsPageMissingError extends ClaimsPersistenceError {
    constructor(message: string);
}
/**
 * Reports a persistence boundary that cannot be proven safe.
 *
 * Unlike ordinary page-local persistence failures, callers must not degrade
 * past this error because doing so could cross a repository boundary.
 */
export declare class ClaimsPersistenceSecurityError extends ClaimsPersistenceError {
    constructor(message: string);
}
/**
 * Reports a malformed or unsafe evidence resource.
 */
export declare class EvidenceResourceError extends ClaimsError {
    constructor(message: string);
}
/**
 * Reports an operational failure while resolving otherwise valid evidence.
 */
export declare class EvidenceResolutionError extends ClaimsError {
    constructor(message: string);
}
/**
 * Reports an evidence path whose physical containment cannot be proven safe.
 */
export declare class EvidenceSecurityError extends EvidenceResolutionError {
    constructor(message: string);
}
/**
 * Reports an invalid claim mutation or authoring-order violation.
 */
export declare class ClaimSessionError extends ClaimsError {
    constructor(message: string);
}
