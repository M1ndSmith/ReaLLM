import { discoverMcpConnectorTools } from "../connectors/mcp-runtime.js";
import type { AuthProviderId } from "./types.js";
export type AuthConfigureResult = {
    configPath: string;
    nextSteps: string[];
    provider: AuthProviderId;
    status: "created" | "exists" | "updated";
};
export type AuthToolListResult = {
    configPath: string;
    provider: AuthProviderId;
    rawFile: string;
    tools: Awaited<ReturnType<typeof discoverMcpConnectorTools>>["tools"];
};
export declare function configureAuthProvider(provider: AuthProviderId, options?: {
    force?: boolean;
}): Promise<AuthConfigureResult>;
export declare function listAuthProviderTools(provider: AuthProviderId): Promise<AuthToolListResult>;
export declare function shouldDiscoverToolsAfterAuth(provider: AuthProviderId): boolean;
