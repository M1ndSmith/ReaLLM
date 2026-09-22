import { loadOpenWikiEnv, saveOpenWikiEnv } from "../config/env.js";
import { discoverAuthorizationServerMetadata, discoverProtectedResourceMetadata, validateOAuthEndpointUrl, } from "./oauth-discovery.js";
import { getAuthProvider } from "./providers.js";
const REFRESH_EXPIRY_SKEW_MS = 60_000;
export async function getOAuthAccessToken(providerId) {
    await loadOpenWikiEnv();
    const provider = getAuthProvider(providerId);
    const accessToken = process.env[provider.tokenMapping.accessTokenEnvKey];
    if (accessToken && !isOAuthAccessTokenExpired(providerId)) {
        return accessToken;
    }
    return await refreshOAuthAccessToken(providerId);
}
export async function refreshOAuthAccessToken(providerId) {
    await loadOpenWikiEnv();
    const provider = getAuthProvider(providerId);
    const refreshTokenEnvKey = provider.tokenMapping.refreshTokenEnvKey;
    const refreshToken = refreshTokenEnvKey
        ? process.env[refreshTokenEnvKey]
        : undefined;
    const clientId = getProviderClientId(provider);
    const clientSecret = provider.clientSecretEnvKey
        ? process.env[provider.clientSecretEnvKey]
        : undefined;
    if (!refreshTokenEnvKey || !refreshToken) {
        throw new Error(`${provider.displayName} refresh token is required for OAuth refresh.`);
    }
    if (!clientId) {
        throw new Error(`${provider.displayName} client id is required for OAuth refresh.`);
    }
    if (provider.clientAuth === "client_secret_post" && !clientSecret) {
        throw new Error(`${provider.clientSecretEnvKey} is required to refresh ${provider.displayName} access.`);
    }
    const tokenUrl = await resolveTokenUrl(provider);
    const body = new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    });
    if (provider.clientAuth === "client_secret_post") {
        body.set("client_secret", clientSecret ?? "");
    }
    if (provider.mcpResourceUrl) {
        body.set("resource", provider.mcpResourceUrl);
    }
    const response = await fetch(validateOAuthEndpointUrl(tokenUrl, `${provider.displayName} token endpoint`, { allowedHosts: provider.oauthAllowedHosts }).toString(), {
        body,
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
        redirect: "manual",
    });
    if (!response.ok) {
        throw new Error(`${provider.displayName} token refresh failed: ${response.status} ${response.statusText}`);
    }
    const tokenResponse = (await response.json());
    const updates = mapTokenResponse(provider, clientId, tokenResponse);
    await saveOpenWikiEnv(updates);
    return updates[provider.tokenMapping.accessTokenEnvKey];
}
export function isOAuthAccessTokenExpired(providerId) {
    const provider = getAuthProvider(providerId);
    const expiresAtEnvKey = provider.tokenMapping.expiresAtEnvKey;
    const expiresAt = expiresAtEnvKey ? process.env[expiresAtEnvKey] : undefined;
    if (!expiresAt) {
        return false;
    }
    const timestamp = Date.parse(expiresAt);
    if (!Number.isFinite(timestamp)) {
        return true;
    }
    return timestamp <= Date.now() + REFRESH_EXPIRY_SKEW_MS;
}
export function getOAuthProviderIdForAccessTokenEnvKey(envKey) {
    const providerIds = ["gmail", "notion", "slack", "x"];
    for (const providerId of providerIds) {
        const provider = getAuthProvider(providerId);
        if (provider.tokenMapping.accessTokenEnvKey === envKey) {
            return providerId;
        }
    }
    return null;
}
function mapTokenResponse(provider, clientId, tokenResponse) {
    const accessToken = getTokenValue(provider, tokenResponse, "access_token");
    const refreshToken = getTokenValue(provider, tokenResponse, "refresh_token");
    const expiresIn = getTokenValue(provider, tokenResponse, "expires_in");
    const tokenType = getTokenValue(provider, tokenResponse, "token_type");
    if (typeof accessToken !== "string" || accessToken.length === 0) {
        throw new Error(`${provider.displayName} token refresh did not return an access token.`);
    }
    const updates = {
        [provider.tokenMapping.accessTokenEnvKey]: accessToken,
    };
    setOptionalTokenUpdate(updates, provider.tokenMapping, "refreshTokenEnvKey", typeof refreshToken === "string" ? refreshToken : undefined);
    setOptionalTokenUpdate(updates, provider.tokenMapping, "tokenTypeEnvKey", typeof tokenType === "string" ? tokenType : undefined);
    if (typeof expiresIn === "number" &&
        Number.isFinite(expiresIn) &&
        provider.tokenMapping.expiresAtEnvKey) {
        updates[provider.tokenMapping.expiresAtEnvKey] = new Date(Date.now() + expiresIn * 1000).toISOString();
    }
    if (provider.tokenMapping.clientIdEnvKey) {
        updates[provider.tokenMapping.clientIdEnvKey] = clientId;
    }
    return updates;
}
function getTokenValue(provider, tokenResponse, key) {
    if (provider.id === "slack") {
        return tokenResponse.authed_user?.[key];
    }
    return tokenResponse[key];
}
function setOptionalTokenUpdate(updates, mapping, key, value) {
    const envKey = mapping[key];
    if (envKey && value) {
        updates[envKey] = value;
    }
}
function getProviderClientId(provider) {
    const envKey = provider.clientIdEnvKey ?? provider.tokenMapping.clientIdEnvKey;
    return envKey ? process.env[envKey] : undefined;
}
async function resolveTokenUrl(provider) {
    if (provider.tokenUrl) {
        return validateOAuthEndpointUrl(provider.tokenUrl, `${provider.displayName} token endpoint`).toString();
    }
    if (provider.mcpResourceUrl) {
        return await discoverMcpTokenEndpoint(provider);
    }
    throw new Error(`${provider.displayName} OAuth token endpoint is unknown.`);
}
async function discoverMcpTokenEndpoint(provider) {
    if (!provider.mcpResourceUrl) {
        throw new Error("MCP OAuth provider requires a resource URL.");
    }
    const validationOptions = { allowedHosts: provider.oauthAllowedHosts };
    const protectedMetadata = await discoverProtectedResourceMetadata(provider.mcpResourceUrl, validationOptions);
    const authServer = protectedMetadata.authorization_servers?.[0];
    if (!authServer) {
        throw new Error("MCP OAuth resource did not advertise an auth server.");
    }
    const tokenMetadata = await discoverAuthorizationServerMetadata(authServer, validationOptions);
    if (!tokenMetadata.token_endpoint) {
        throw new Error("MCP OAuth authorization server did not expose token_endpoint.");
    }
    return validateOAuthEndpointUrl(tokenMetadata.token_endpoint, `${provider.displayName} token endpoint`, validationOptions).toString();
}
