/**
 * Attaches the (opt-in, --debug) credential diagnostics to a live run: records
 * them on the ref so a later settle can carry them forward, and folds them into
 * the state only while it is still "running". A no-op on any other status so a
 * late diagnostics resolution cannot resurrect a settled run.
 */
export function updateRunningCredentialDiagnostics(state, credentialDiagnostics, credentialDiagnosticsRef) {
    credentialDiagnosticsRef.current = credentialDiagnostics;
    return state.status === "running"
        ? {
            ...state,
            credentialDiagnostics,
        }
        : state;
}
