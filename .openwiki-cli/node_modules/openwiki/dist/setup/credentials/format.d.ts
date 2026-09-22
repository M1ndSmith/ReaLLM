import { type OpenWikiProvider } from "../../config/constants.js";
import { type CodexTokens } from "../../agent/openai-chatgpt-oauth.js";
import type { AuthProviderId } from "../../auth/types.js";
export declare function getAwsCredentialRepairMessage(provider: OpenWikiProvider): string | null;
export declare function getCredentialSetupDetail(provider: OpenWikiProvider, tokens?: CodexTokens | null): string;
/**
 * Copies text to the terminal's clipboard using the OSC 52 escape sequence.
 * This targets the user's local terminal emulator even when OpenWiki runs over
 * SSH, unlike shelling out to a host clipboard utility.
 */
export declare function copyToClipboard(text: string): void;
export declare function openLoginUrl(url: string): void;
export declare function mask(value: string): string;
export declare function getOAuthAuthorizationStatusText({ authProvider, copiedToClipboard, }: {
    authProvider?: AuthProviderId;
    copiedToClipboard: boolean;
}): string;
export declare function formatSecretInputDisplay(value: string): string;
export declare function formatTerminalHyperlink(url: string, label: string): string;
export declare function getSingleLineInputDisplayValue(value: string, maxLength: number): string;
