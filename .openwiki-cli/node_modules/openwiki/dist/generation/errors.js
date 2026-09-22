/**
 * Reports an invalid or conflicting repository-run lifecycle operation.
 */
export class RepositoryRunError extends Error {
    /**
     * Stable protocol-facing category for this lifecycle failure.
     */
    code;
    /**
     * Creates a lifecycle error with a stable protocol-facing error code.
     */
    constructor(code, message) {
        super(message);
        this.name = "RepositoryRunError";
        this.code = code;
    }
}
