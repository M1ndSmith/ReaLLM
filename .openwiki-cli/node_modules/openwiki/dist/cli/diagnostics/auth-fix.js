import { getProviderApiKeyEnvKey, providerUsesAwsSdkCredentials, } from "../../config/constants.js";
import { getShellEnvValue } from "../../config/env.js";
import { openWikiEnvDisplayPath } from "../../config/openwiki-home.js";
import { isAuthError } from "../../platform/diagnostics.js";
/**
 * The auth "how to fix" context for a failure, or undefined when it does not
 * look like an auth error. Names the failing provider's API key env var and
 * flags whether it came from the shell (a shell export shadows saved config, so
 * the fix is to unset it). Existence check only, never reads the value.
 */
export function getAuthFix(error, message, provider) {
    if (!isAuthError(error, message)) {
        return undefined;
    }
    const apiKeyEnvKey = getProviderApiKeyEnvKey(provider);
    return {
        apiKeyEnvKey,
        keyFromShell: apiKeyEnvKey !== undefined &&
            getShellEnvValue(apiKeyEnvKey) !== undefined,
        provider,
    };
}
/**
 * The ordered, human-readable remediation steps for an {@link AuthFix},
 * tailored to the provider: AWS SDK providers get credential-chain guidance,
 * key-based providers get "unset the shadowing shell export" when relevant plus
 * the re-enter-your-key fallback.
 */
export function getAuthFixSteps(authFix) {
    const steps = [];
    if (providerUsesAwsSdkCredentials(authFix.provider)) {
        steps.push("Verify the selected AWS identity with `aws sts get-caller-identity` in the same environment.", "Configure the AWS SDK credential chain (OIDC/workload role, AWS_PROFILE/SSO, or standard AWS credentials) and a Bedrock region, then retry.", "Unset AWS_BEARER_TOKEN_BEDROCK for OIDC/IAM runs; a bearer token takes precedence when present.", `A complete BEDROCK_AWS_ACCESS_KEY_ID/BEDROCK_AWS_SECRET_ACCESS_KEY pair takes precedence; unset both in the shell and remove both from ${openWikiEnvDisplayPath} to use ambient AWS credentials.`);
        return steps;
    }
    if (authFix.keyFromShell && authFix.apiKeyEnvKey) {
        steps.push(`${authFix.apiKeyEnvKey} came from your shell, not ${openWikiEnvDisplayPath}. ` +
            `Unset it (unset ${authFix.apiKeyEnvKey}) or fix it, then retry.`);
    }
    steps.push(`Re-enter your key: re-run openwiki --init, or edit ${openWikiEnvDisplayPath}.`);
    return steps;
}
