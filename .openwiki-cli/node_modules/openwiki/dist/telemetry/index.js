export { buildRunEvent, recordRun } from "./senders.js";
export { recordRunSafe } from "./record-run-safe.js";
export { withRunTelemetry } from "./with-run-telemetry.js";
export { firstRunNoticePending } from "./install-id.js";
export { FIRST_RUN_NOTICE_BODY, FIRST_RUN_NOTICE_OPT_OUT, FIRST_RUN_NOTICE_VERIFY, } from "./config.js";
export { classifyError, describeErrorForTelemetry, inStage, inStageSync, tagErrorStage, } from "./errors.js";
export { deriveOwner, normalizeErrorDetail } from "./taxonomy.js";
export { isCiEnvironment, isTelemetryDisabled } from "./gates.js";
