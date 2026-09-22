import React from "react";
/** Frame/wrap width for the plain-text (print/non-TTY) first-run disclosure. */
export declare const FIRST_RUN_NOTICE_WIDTH = 64;
/** Greedy word-wrap to `width` columns. Input carries no existing newlines. */
export declare function wrapText(text: string, width: number): string[];
/**
 * The plain-text first-run disclosure for print/non-TTY output: the same copy as
 * the interactive box (single-sourced in telemetry/config.ts), framed with light
 * rules and wrapped to a fixed width. Rendered gray when stderr is a TTY, plain
 * when redirected so a captured log stays free of escape codes.
 */
export declare function renderFirstRunNoticeText(color: boolean): string;
/**
 * The one-time telemetry disclosure, rendered as a box so it sits inline with
 * the rest of the TUI (mirrors SetupHeader's rounded style). The copy is
 * single-sourced in telemetry/config.ts; the print/non-TTY path renders the
 * same wording as plain text via renderFirstRunNoticeText.
 */
export declare function FirstRunNotice(): React.JSX.Element;
