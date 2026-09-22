import type { OpenWikiProvider } from "./config/constants.js";
export type ModelAvailability = {
    status: "available";
} | {
    status: "unavailable";
    reason: string;
} | {
    status: "unknown";
    reason?: string;
};
interface ModelAvailabilityCheck {
    apiKey?: string;
    baseUrl?: string;
    modelId: string;
    provider: OpenWikiProvider;
}
/**
 * Checks whether a selected model is exposed to the configured provider
 * credential. `unknown` deliberately preserves the existing inference path:
 * a catalogue lookup failure is not proof that a model cannot be invoked.
 */
export declare function getSelectedModelAvailability(check: ModelAvailabilityCheck, fetchImpl?: typeof fetch): Promise<ModelAvailability>;
export {};
