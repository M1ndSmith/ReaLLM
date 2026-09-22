import type { InitSetupProps } from "./credentials/types.js";
export type { InitSetupResult } from "./credentials/types.js";
export { ensureRunModeConfig, findNearestGitRepoRoot, getInitialStep, getNextStepAfterProvider, hydrateRunModeConfig, needsCredentialSetup, needsLangSmithStep, nextSetupStep, orderedSetupSteps, resolveStepStatus, } from "./credentials/steps.js";
export { getOAuthAuthorizationStatusText } from "./credentials/format.js";
/**
 * First-run setup wizard.
 *
 * A thin composition root: {@link useInitSetup} owns the state machine and
 * returns the wired-up view props, and {@link InitSetupView} renders them. The
 * controller and presentation live in their own modules so this entry point
 * stays small and the two concerns can be reasoned about independently.
 */
export declare function InitSetup(props: InitSetupProps): import("react").JSX.Element;
