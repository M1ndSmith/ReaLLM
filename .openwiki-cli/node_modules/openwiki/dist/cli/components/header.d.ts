import React from "react";
/** The OpenWiki ASCII wordmark shown at the top of the full header. */
export declare const OPENWIKI_LOGO_LINES: string[];
/** Width of the widest logo line, used to gate whether the logo fits. */
export declare const OPENWIKI_LOGO_WIDTH: number;
/**
 * Props for the session header.
 */
interface HeaderProps {
    /**
     * @default false Render the full bordered header with logo instead of the
     * single-line compact form.
     */
    compact?: boolean;
    /**
     * @default undefined Fall back to the model env override, then the configured
     * provider's default model id.
     */
    modelId?: string | null;
    /**
     * @default true Show the ASCII logo when it fits the terminal width.
     */
    showLogo?: boolean;
    subtitle: string;
}
/**
 * The session header showing OpenWiki version, provider, model, optional
 * reasoning effort, directory, and LangSmith tracing state. Renders a compact
 * single-line variant or the full bordered form with logo. All interpolated values pass through
 * sanitizeHeaderValue so control characters cannot reach the terminal.
 */
export declare function Header({ compact, modelId, showLogo, subtitle, }: HeaderProps): React.JSX.Element;
export {};
