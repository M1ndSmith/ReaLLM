import { type WikiGraph } from "./graph.js";
/** Browser assets emitted alongside the server and copied into static exports. */
export interface VisualizerAssets {
    clientJs: string;
    clientLibJs: string;
    /** Stylesheet served verbatim and copied into static exports. */
    stylesCss: string;
}
/** Inputs for writing a self-contained static visualizer directory. */
export interface StaticVisualizerExportOptions {
    /** Absolute path to the generated wiki that supplies graph data. */
    wikiRoot: string;
    /** Absolute path to the directory receiving the static app. */
    outputDir: string;
    /** Test seam; production callers load the compiled browser modules. */
    assets?: VisualizerAssets;
}
/** Summary of the graph captured by one static export. */
export interface StaticVisualizerExportResult {
    outputDir: string;
    graph: WikiGraph;
}
/** Read the browser assets that ship beside this module in dist. */
export declare function loadVisualizerAssets(): Promise<VisualizerAssets>;
/**
 * Write the visualizer as sibling static files. The client reads ./graph.json and
 * never opens an SSE connection, so the output can be hosted without OpenWiki.
 */
export declare function exportStaticVisualizer(options: StaticVisualizerExportOptions): Promise<StaticVisualizerExportResult>;
