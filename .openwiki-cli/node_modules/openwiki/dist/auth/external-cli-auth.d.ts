import { type OpenWikiProvider } from "../config/constants.js";
type ExternalCliAuthAdapterConfig = {
    credentialDescription: string;
    installHint: string;
    loginCommand: string;
    name: string;
    command: string;
    commandArgs: readonly string[];
    tokenArgs: readonly string[];
};
export type ExternalCliAuthState = {
    kind: "idle";
} | {
    kind: "checking";
} | {
    kind: "detected";
} | {
    kind: "not-detected";
    cliAvailable: boolean;
} | {
    kind: "logging-in";
} | {
    kind: "login-failed";
};
export declare function getExternalCliAuthAdapter(provider: OpenWikiProvider, env?: NodeJS.ProcessEnv): ExternalCliAuthAdapterConfig | null;
export declare function isExternalCliAvailable(provider: OpenWikiProvider): Promise<boolean>;
export declare function detectExternalCliCredential(provider: OpenWikiProvider, env?: NodeJS.ProcessEnv): Promise<string | null>;
/**
 * Reuse an external CLI credential for this process only. The CLI remains the
 * source of truth, so its token is deliberately never written to OpenWiki's
 * env file.
 */
export declare function resolveExternalCliCredential(provider: OpenWikiProvider, env?: NodeJS.ProcessEnv): Promise<boolean>;
export declare function runExternalCliLogin(provider: OpenWikiProvider): Promise<boolean>;
export declare function validateExternalCliCredential(provider: OpenWikiProvider, credential: string): void;
export {};
