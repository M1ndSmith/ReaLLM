/**
 * Expected host-integration failure safe to project through a transport.
 */
export class HostIntegrationError extends Error {
    /**
     * Stable machine-readable failure category.
     */
    code;
    /**
     * Creates a safe host-integration error.
     *
     * @param code - Stable machine-readable failure category.
     * @param message - Bounded user-facing explanation.
     */
    constructor(code, message) {
        super(message);
        this.name = "HostIntegrationError";
        this.code = code;
    }
}
