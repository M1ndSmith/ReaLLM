export type OAuthMetadata = {
    authorization_endpoint?: string;
    registration_endpoint?: string;
    scopes_supported?: string[];
    token_endpoint?: string;
};
export type ProtectedResourceMetadata = {
    authorization_servers?: string[];
};
export type OAuthEndpointValidationOptions = {
    allowedHosts?: readonly string[];
};
export declare function discoverProtectedResourceMetadata(resourceUrl: string, options?: OAuthEndpointValidationOptions): Promise<ProtectedResourceMetadata>;
export declare function discoverAuthorizationServerMetadata(issuer: string, options?: OAuthEndpointValidationOptions): Promise<OAuthMetadata>;
export declare function validateOAuthEndpointUrl(value: string, label: string, options?: OAuthEndpointValidationOptions): URL;
