import type { CliCommand } from "./commands.js";
type ResolveStartupCommandOptions = {
    cwd?: string;
    isStdinTTY?: boolean;
};
export declare function resolveStartupCommand(command: CliCommand, options?: ResolveStartupCommandOptions): Promise<CliCommand>;
export {};
