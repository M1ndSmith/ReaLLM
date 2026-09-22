/**
 * Restores the interactive UI first, then delivers SIGINT on the next turn.
 * Existing-wiki init installs a SIGINT handler that rolls the wiki back before
 * exiting. Other commands have no handler and exit immediately with code 130.
 */
export function requestProcessInterrupt(restoreTerminal, target = process) {
    restoreTerminal();
    setImmediate(() => {
        if (!target.emit("SIGINT")) {
            target.exit(130);
        }
    });
}
