import type { AuthProviderId, OAuthProviderConfig } from "./types.js";
export declare const AUTH_PROVIDERS: Record<AuthProviderId, OAuthProviderConfig>;
export declare function getAuthProvider(providerId: AuthProviderId): OAuthProviderConfig;
export declare function isAuthProviderId(value: string): value is AuthProviderId;
