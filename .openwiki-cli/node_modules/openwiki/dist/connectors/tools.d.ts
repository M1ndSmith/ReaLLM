import { type StructuredToolInterface } from "@langchain/core/tools";
import type { OpenWikiOutputMode } from "../agent/types.js";
export declare function createOpenWikiConnectorTools(outputMode?: OpenWikiOutputMode): StructuredToolInterface[];
export declare function normalizeRawRelativePath(relativePath: string): string;
