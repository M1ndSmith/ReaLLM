import type React from "react";
import type { OpenWikiRunEvent } from "../../agent/types.js";
import type { RunLogItem } from "./types.js";
/**
 * Folds a run event into a bounded progress model. Main-agent prose is kept as
 * one replaceable buffer, subgraph prose is discarded, and filesystem tools
 * contribute exact path activity without exposing their transcript.
 */
export declare function appendRunLogEvent(log: RunLogItem[], event: OpenWikiRunEvent, nextLogId: React.MutableRefObject<number>): RunLogItem[];
