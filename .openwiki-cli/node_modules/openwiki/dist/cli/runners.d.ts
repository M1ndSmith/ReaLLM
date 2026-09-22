import type { CliCommand } from "./commands.js";
export declare function runNgrokCommand(command: Extract<CliCommand, {
    kind: "ngrok";
}>): Promise<void>;
/**
 * Start the wiki visualizer server or export its static files for web hosting.
 */
export declare function runVisualizeCommand(command: Extract<CliCommand, {
    kind: "visualize";
}>): Promise<void>;
export declare function runCronCommand(command: Extract<CliCommand, {
    kind: "cron";
}>): Promise<void>;
export declare function runIngestCommand(command: Extract<CliCommand, {
    kind: "ingest";
}>): Promise<void>;
export declare function runAuthCommand(command: Extract<CliCommand, {
    kind: "auth";
}>): Promise<void>;
/**
 * Builds the telemetry context for a run from the parsed command. Flag names
 * only, never argument values.
 */
export declare function runPrintCommand(command: Extract<CliCommand, {
    kind: "run";
}>): Promise<void>;
/**
 * Write the concise auth "how to fix" guidance to stderr on a non-interactive
 * failure, mirroring the interactive panel so CI/print runs get the same help.
 * No-op unless the failure looks like an auth error. Key names only.
 */
export declare function writePrintAuthFix(error: unknown, message: string): void;
export declare function writePrintErrorDiagnostics(error: unknown): void;
