export type NgrokStartOptions = {
    port?: number;
    url?: string | null;
};
export type NgrokStartResult = {
    baseUrl: string;
    port: number;
    redirectUri: string;
};
export declare function startNgrokTunnel({ port, url, }: NgrokStartOptions): Promise<NgrokStartResult>;
export declare function getRedirectUriFromNgrokTunnels(value: unknown, port: number): string | null;
