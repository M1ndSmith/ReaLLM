import { type OpenWikiProvider } from "../../config/constants.js";
/**
 * What the "How to fix" panel needs after an auth failure. Key names only, no
 * secret values: {@link AuthFix.keyFromShell} reflects only whether the failing
 * provider's API key was sourced from a shell export (which shadows saved
 * config), so the panel can tell the user to unset it.
 */
export interface AuthFix {
    /**
     * The env var that holds the failing provider's API key (e.g.
     * `ANTHROPIC_API_KEY`), or undefined when the provider has no single key var
     * (such as the AWS SDK credential chain).
     */
    apiKeyEnvKey: string | undefined;
    /**
     * True when {@link AuthFix.apiKeyEnvKey} is set from the shell environment
     * rather than saved config; a shell export shadows the saved `.env`, so the
     * fix is to unset it.
     */
    keyFromShell: boolean;
    /**
     * The provider whose credentials were rejected.
     */
    provider: OpenWikiProvider;
}
/**
 * The auth "how to fix" context for a failure, or undefined when it does not
 * look like an auth error. Names the failing provider's API key env var and
 * flags whether it came from the shell (a shell export shadows saved config, so
 * the fix is to unset it). Existence check only, never reads the value.
 */
export declare function getAuthFix(error: unknown, message: string, provider: OpenWikiProvider): AuthFix | undefined;
/**
 * The ordered, human-readable remediation steps for an {@link AuthFix},
 * tailored to the provider: AWS SDK providers get credential-chain guidance,
 * key-based providers get "unset the shadowing shell export" when relevant plus
 * the re-enter-your-key fallback.
 */
export declare function getAuthFixSteps(authFix: AuthFix): string[];
