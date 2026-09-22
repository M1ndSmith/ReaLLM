import React from "react";
import type { OpenWikiCommand } from "../../agent/types.js";
import type { CredentialDiagnostic } from "../../config/env.js";
import { type AuthFix } from "../diagnostics/auth-fix.js";
import type { ErrorDiagnostic } from "../diagnostics/error-diagnostics.js";
/**
 * The `--help` screen: usage, commands, options, and examples, gated to also
 * show development-only rows when running in development mode.
 */
export declare function HelpView(): React.JSX.Element;
/**
 * Props for the development dry-run execution-plan view.
 */
interface DryRunViewProps {
    command: OpenWikiCommand;
    modelId: string | null;
    shouldStart: boolean;
    userMessage: string | null;
}
/**
 * The `--dry-run` execution plan: shows what a run would do without reading
 * credentials, invoking the agent, or writing any files.
 */
export declare function DryRunView({ command, modelId, shouldStart, userMessage, }: DryRunViewProps): React.JSX.Element;
/**
 * Diagnostics for configured credentials. Explicitly never prints raw secret
 * values; only the source, length, a safe preview, and any warnings.
 */
export declare function CredentialDiagnosticsPanel({ diagnostics, }: {
    diagnostics: CredentialDiagnostic[];
}): React.JSX.Element;
/**
 * The ordered "how to fix" steps for an auth failure. Shared by the interactive
 * panel and the --print stderr path so they stay in sync. Names env keys only,
 * never secret values.
 */
export declare function AuthFixPanel({ authFix }: {
    authFix: AuthFix;
}): React.JSX.Element;
/**
 * Debug-mode error diagnostics. Only allowlisted, non-secret error fields are
 * shown, gated behind OPENWIKI_DEBUG.
 */
export declare function ErrorDiagnosticsPanel({ diagnostics, }: {
    diagnostics: ErrorDiagnostic[];
}): React.JSX.Element;
export {};
