import type { AuthProviderId } from "./types.js";
export declare function getOAuthAccessToken(providerId: AuthProviderId): Promise<string>;
export declare function refreshOAuthAccessToken(providerId: AuthProviderId): Promise<string>;
export declare function isOAuthAccessTokenExpired(providerId: AuthProviderId): boolean;
export declare function getOAuthProviderIdForAccessTokenEnvKey(envKey: string): AuthProviderId | null;
