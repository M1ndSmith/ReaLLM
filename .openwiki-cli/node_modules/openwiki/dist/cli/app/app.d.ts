import React from "react";
import type { CliCommand } from "../commands.js";
/**
 * Props for the interactive OpenWiki application shell.
 */
interface AppProps {
    /**
     * Parsed CLI command that configures the application session.
     */
    command: CliCommand;
}
export declare function App({ command }: AppProps): React.JSX.Element;
export {};
