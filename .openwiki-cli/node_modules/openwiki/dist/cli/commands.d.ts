import type { OpenWikiCommand } from "../agent/types.js";
import type { AuthProviderId } from "../auth/types.js";
import { type IngestionTarget } from "../ingestion/ingestion.js";
import type { HostIntegrationScope, HostTargetId } from "../integrations/install/types.js";
export type HelpRow = {
    label: string;
    description: string;
};
export type OpenWikiRunMode = "personal" | "code";
type CronTarget = Extract<IngestionTarget, string>;
export type HelpContent = {
    title: string;
    description: string;
    usage: string[];
    commands: HelpRow[];
    options: HelpRow[];
    developmentOptions: HelpRow[];
    examples: string[];
    developmentExamples: string[];
};
/**
 * Parsed host-integration installation command.
 */
export interface IntegrationsCliCommand {
    /**
     * CLI dispatch discriminator.
     */
    kind: "integrations";
    /**
     * Registry operation requested by the user.
     */
    action: "install" | "list" | "uninstall";
    /**
     * Initial process exit code.
     */
    exitCode: 0;
    /**
     * Selected host, or `null` for the list action.
     */
    target: HostTargetId | null;
    /**
     * Ownership scope selected for the operation.
     */
    scope: HostIntegrationScope;
    /**
     * Optional project root supplied with `--project`.
     *
     * @default null - user scope is selected and the user's home is used.
     */
    projectRoot: string | null;
    /**
     * Whether install may replace unmanaged skill content.
     */
    force: boolean;
}
/**
 * Parsed internal MCP server command.
 */
export interface McpCliCommand {
    /**
     * CLI dispatch discriminator.
     */
    kind: "mcp";
    /**
     * Initial process exit code.
     */
    exitCode: 0;
    /**
     * Host identifier written to run metadata.
     */
    host: string;
}
/**
 * Host-integration commands added to the root CLI union.
 */
export type HostIntegrationCliCommand = IntegrationsCliCommand | McpCliCommand;
export type CliCommand = HostIntegrationCliCommand | {
    kind: "auth";
    action: "configure" | "list" | "oauth" | "tools";
    exitCode: 0;
    force: boolean;
    provider: AuthProviderId | null;
} | {
    kind: "ngrok";
    action: "start";
    exitCode: 0;
    port: number;
    url: string | null;
} | {
    kind: "visualize";
    exitCode: 0;
    wikiDir: string;
    port: number;
    open: boolean;
    exportDir: string | null;
} | {
    kind: "ingest";
    exitCode: 0;
    modelId: string | null;
    print: boolean;
    scheduledOnly: boolean;
    target: IngestionTarget;
} | {
    kind: "cron";
    action: "delete" | "list" | "pause" | "resume";
    exitCode: 0;
    target: CronTarget | null;
} | {
    kind: "help";
    exitCode: 0;
} | {
    kind: "run";
    exitCode: 0;
    command: OpenWikiCommand;
    dryRun: boolean;
    language: string | null;
    mode: OpenWikiRunMode;
    modeSource: OpenWikiRunModeSource;
    modelId: string | null;
    print: boolean;
    shouldStart: boolean;
    userMessage: string | null;
    telemetryFile: string | null;
} | {
    kind: "error";
    exitCode: 1;
    message: string;
};
export type OpenWikiRunModeSource = "default" | "option" | "positional";
export declare function parseCommand(argv: string[]): CliCommand;
/**
 * True when a run must bypass the Ink UI and use the non-interactive path:
 * either the user asked for print mode, or stdin is not a TTY (CI, cron,
 * pipes), where Ink's raw-mode input is unavailable and rendering the UI
 * fails. Interactive chat without a message still requires a TTY, so it is
 * excluded.
 */
export declare function shouldRunNonInteractively(command: CliCommand, stdinIsTTY: boolean): command is Extract<CliCommand, {
    kind: "run";
}>;
export declare function isDevelopmentMode(): boolean;
/**
 * True for commands that send telemetry and therefore require the one-time
 * disclosure. Only init/update runs emit the single openwiki_run event; chat,
 * auth, and ingest record nothing, so those sessions need no disclosure.
 */
export declare function commandEmitsTelemetry(command: CliCommand): boolean;
/**
 * True when a command needs credentials from OpenWiki's private environment.
 * Host integration and MCP commands deliberately use the host's authenticated
 * session and never load OpenWiki model credentials.
 *
 * @param command - Parsed command to inspect.
 * @returns Whether the CLI should load the OpenWiki environment.
 */
export declare function commandLoadsEnvironment(command: CliCommand): boolean;
export declare const helpContent: HelpContent;
export declare function getHelpText(): string;
export {};
