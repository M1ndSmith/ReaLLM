import type { InitSetupProps } from "./types.js";
import type { InitSetupViewProps } from "./view.js";
/**
 * The controller behind `InitSetup`: it owns the entire setup state machine
 * (state, refs, effects, keyboard routing, and completion/persistence) and
 * returns the fully-wired presentational props for `InitSetupView`. Splitting it
 * out keeps `credentials.tsx` a thin composition root and isolates the
 * hard-to-unit-test Ink keyboard flow in one file (excluded from coverage).
 */
export declare function useInitSetup({ allowModeSelection, mode, modelIdOverride, onComplete, onError, walkAllSteps, }: InitSetupProps): InitSetupViewProps;
