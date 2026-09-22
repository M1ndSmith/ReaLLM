/**
 * Reads the install id, creating it on first use. `isNew` is true only when the
 * id was just minted which is the signal for the one-time notice. The id is a
 * random UUID with no relationship to the user, machine, or repository.
 */
export declare function getOrCreateInstallId(): Promise<{
    id: string;
    isNew: boolean;
}>;
/**
 * Whether the one-time first-run notice should be shown now: true only on the
 * first run on this machine (install id just minted). Suppressed (returns false,
 * mints no id) when opted out or in CI. Never throws. The caller decides how to
 * render it (an Ink box in the interactive TUI, plain text on stderr for print),
 * so this stays free of presentation. Called at the START of a run so the
 * disclosure precedes any output.
 */
export declare function firstRunNoticePending(): Promise<boolean>;
