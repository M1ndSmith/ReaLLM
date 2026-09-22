import type { CompleteSetupOptions } from "./types.js";
/**
 * Build the `~/.openwiki/.env` update map from the values the wizard collected.
 *
 * Pure: it computes which keys to write and their values, but performs no IO and
 * mutates nothing. The caller resolves the oauth-token fallback and persists the
 * result (via `saveOpenWikiEnv`), which is what owns the file permissions. A key
 * is included only when the wizard collected a value for it, so untouched
 * settings are left as-is. The provider key is written only when it actually
 * changes, so a re-run that keeps the same provider does not churn the file.
 *
 * @param options - the credential/config values collected this session.
 *
 * @param env - the environment to compare against for the provider-changed
 * check; injected so tests can pass a fabricated `NodeJS.ProcessEnv` instead of
 * reading the real one.
 */
export declare function buildCredentialEnvUpdates(options: CompleteSetupOptions, env: NodeJS.ProcessEnv): Record<string, string>;
