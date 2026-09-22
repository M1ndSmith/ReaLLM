import { type IncomingMessage, type ServerResponse } from "node:http";
import { type WikiGraph } from "./graph.js";
/**
 * Inputs for a single visualizer server run. Every field is required: the CLI parser
 * fills the defaults, so the server itself never has to guess.
 */
export interface VisualizeServerOptions {
    /**
     * Resolved absolute path to the wiki directory to serve.
     */
    wikiRoot: string;
    /**
     * Preferred TCP port; the server increments from here when it is already in use.
     */
    port: number;
    /**
     * Whether to open the default browser once the server is listening.
     */
    open: boolean;
}
/**
 * Start the visualizer server. Resolves when the server is stopped (SIGINT);
 * exits the process on an unrecoverable listen error, matching the prototype.
 */
export declare function runVisualizeServer(options: VisualizeServerOptions): Promise<void>;
/**
 * Dependencies for the visualizer HTTP request handler. The handler is a pure
 * router over a fixed set of routes; everything it needs is passed in so it can
 * be exercised without booting a real server.
 */
export interface RequestHandlerDeps {
    /**
     * Read the current wiki graph. A getter (not the graph itself) because the
     * server reassigns the graph on every rebuild, and each request must serve the
     * latest one.
     */
    getGraph: () => WikiGraph;
    /**
     * Compiled browser client module, served verbatim at `/client.js`.
     */
    clientJs: string;
    /**
     * Compiled browser client library module, served verbatim at `/client-lib.js`.
     */
    clientLibJs: string;
    /**
     * Visualizer stylesheet, served verbatim at `/styles.css`.
     */
    stylesCss: string;
    /**
     * Live set of open Server-Sent-Events responses; the handler registers new
     * `/events` subscribers here and drops them when the connection closes.
     */
    sseClients: Set<ServerResponse>;
}
/**
 * Build the visualizer HTTP request handler. Routing is locked to a fixed set of
 * routes (`/`, `/index.html`, `/client.js`, `/client-lib.js`, `/styles.css`,
 * `/api/graph`, `/events`); no filesystem path is ever derived from `req.url`, and
 * `/` carries the strict Content-Security-Policy. Any other path is a 404.
 */
export declare function createRequestHandler(deps: RequestHandlerDeps): (req: IncomingMessage, res: ServerResponse) => void;
