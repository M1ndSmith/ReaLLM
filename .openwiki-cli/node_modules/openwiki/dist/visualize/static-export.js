import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildGraph } from "./graph.js";
import { STATIC_PAGE } from "./page.js";
/** Read the browser assets that ship beside this module in dist. */
export async function loadVisualizerAssets() {
    const [clientJs, clientLibJs, stylesCss] = await Promise.all([
        readFile(new URL("./client.js", import.meta.url), "utf8"),
        readFile(new URL("./client-lib.js", import.meta.url), "utf8"),
        readFile(new URL("./styles.css", import.meta.url), "utf8"),
    ]);
    return { clientJs, clientLibJs, stylesCss };
}
/**
 * Write the visualizer as sibling static files. The client reads ./graph.json and
 * never opens an SSE connection, so the output can be hosted without OpenWiki.
 */
export async function exportStaticVisualizer(options) {
    const [graph, assets] = await Promise.all([
        buildGraph(options.wikiRoot),
        options.assets ? Promise.resolve(options.assets) : loadVisualizerAssets(),
    ]);
    await mkdir(options.outputDir, { recursive: true });
    await Promise.all([
        writeFile(path.join(options.outputDir, "index.html"), STATIC_PAGE, "utf8"),
        writeFile(path.join(options.outputDir, "client.js"), assets.clientJs, "utf8"),
        writeFile(path.join(options.outputDir, "client-lib.js"), assets.clientLibJs, "utf8"),
        writeFile(path.join(options.outputDir, "styles.css"), assets.stylesCss, "utf8"),
        writeFile(path.join(options.outputDir, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8"),
    ]);
    return { outputDir: options.outputDir, graph };
}
