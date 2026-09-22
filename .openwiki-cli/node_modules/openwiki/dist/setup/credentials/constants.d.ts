import type { SetupStepState } from "./types.js";
export declare const ONBOARDING_TEMPLATES: readonly [{
    readonly description: "Maintain a structured project wiki from a local Git repository, with code-oriented pages for architecture, workflows, source maps, and operational guidance.";
    readonly id: "code";
    readonly name: "Code";
    readonly sourceIds: ["langsmith"];
    readonly suggestedSources: ["Local Git repository"];
    readonly suggestedGoal: "A code wiki for this repository.";
}, {
    readonly description: "A personal assistant wiki that builds memory from email, notes, social/research sources, and web search so you can ask about projects, priorities, people, and recurring context.";
    readonly id: "personal";
    readonly name: "Personal";
    readonly sourceIds: ["custom-mcp", "git-repo", "google", "notion", "web-search", "hackernews", "x"];
    readonly suggestedSources: ["Gmail", "Notion", "Custom MCP", "Web Search (Tavily)", "Hacker News", "X/Twitter"];
    readonly suggestedGoal: "Your personal brain. Track active projects, people, organizations, decisions, commitments, follow-ups, useful links, recurring themes, and fresh external signals. Organize the wiki so a personal assistant can answer what changed, what matters, what needs attention, and where supporting evidence came from. Be selective: summarize durable context and explicit action items, not every raw item.";
}];
export declare const RUN_MODE_OPTIONS: readonly [{
    readonly description: `Build a local personal brain wiki in ${string} from configured sources.`;
    readonly id: "personal";
    readonly name: "Personal";
}, {
    readonly description: "Build repository documentation in ./openwiki for this codebase.";
    readonly id: "code";
    readonly name: "Code";
}];
export declare const LANGSMITH_REGION_OPTIONS: readonly [{
    readonly description: "US workspaces. The default.";
    readonly host: "https://api.smith.langchain.com";
    readonly id: "us";
    readonly name: "US";
}, {
    readonly description: "EU workspaces.";
    readonly host: "https://eu.api.smith.langchain.com";
    readonly id: "eu";
    readonly name: "EU";
}, {
    readonly description: "APAC workspaces.";
    readonly host: "https://apac.api.smith.langchain.com";
    readonly id: "apac";
    readonly name: "APAC";
}];
export declare const SOURCE_OPTIONS: readonly [{
    readonly displayName: "Local Git repository";
    readonly examples: ["Track architecture notes from this repo.", "Summarize recent commits and changed files."];
    readonly id: "git-repo";
    readonly instructions: ["Choose the local repository directory OpenWiki should read.", "The default is the current working directory, and you can replace it with another path.", "You can add more repositories later in the connector config file."];
    readonly secretInputs: [];
}, {
    readonly displayName: "LangSmith traces";
    readonly examples: ["support-bot-prod", "chat-agent"];
    readonly id: "langsmith";
    readonly instructions: ["Document how your agent runs, grounded in its LangSmith traces.", "List the projects to document; written to openwiki/.langsmith.json (committed)."];
    readonly secretInputs: [];
}, {
    readonly authProvider: "notion";
    readonly displayName: "Notion";
    readonly examples: ["Ingest product specs, meeting notes, and research pages.", "Prioritize pages related to Applied AI and customer feedback."];
    readonly id: "notion";
    readonly instructions: ["OpenWiki uses Notion's hosted MCP OAuth flow.", "No client ID, client secret, or pasted Notion token is required.", "Approve access in the browser window when it opens."];
    readonly secretInputs: [];
}, {
    readonly displayName: "Custom MCP";
    readonly examples: ["Point OpenWiki at a Linear, Jira, or internal MCP server.", "Ingest read-only tools from a self-hosted knowledge MCP."];
    readonly id: "custom-mcp";
    readonly instructions: [`Edit ${string}/custom-mcp/config.json after setup.`, "Set \"enabled\": true and an HTTP or stdio \"transport\".", `Put secrets only in ${string}; reference them as \${ENV_NAME} in headers/env.`, "Prefer allowedTools and MCP readOnlyHint. Optionally set readOnlyOperations for a fixed pull recipe.", "Do not allowlist mutating tools. This is a built-in generic MCP source, not a plugin loader."];
    readonly secretInputs: [];
}, {
    readonly authProvider: "gmail";
    readonly displayName: "Gmail";
    readonly examples: ["Capture important project email threads from the last 24 hours.", "Look for vendor updates, customer feedback, and action items."];
    readonly id: "google";
    readonly instructions: ["Create OAuth credentials in Google Cloud for a desktop or web app.", "Enable the Gmail API for the Google Cloud project.", "Add http://127.0.0.1:53682/callback as an authorized redirect URI.", "Paste the client ID and client secret below."];
    readonly secretInputs: [{
        readonly envKey: "OPENWIKI_GOOGLE_CLIENT_ID";
        readonly label: "Google OAuth client ID";
    }, {
        readonly envKey: "OPENWIKI_GOOGLE_CLIENT_SECRET";
        readonly label: "Google OAuth client secret";
        readonly secret: true;
    }];
}, {
    readonly displayName: "Web Search (Tavily)";
    readonly examples: ["Track a company, product category, or technical topic.", "Find launch posts, docs, pricing pages, and recent articles."];
    readonly id: "web-search";
    readonly instructions: ["Create a Tavily account and API key.", "Paste the Tavily API key below.", "Describe the topics, companies, or pages OpenWiki should search for on the next screen."];
    readonly secretInputs: [{
        readonly envKey: "TAVILY_API_KEY";
        readonly label: "Tavily API key";
        readonly secret: true;
    }];
}, {
    readonly displayName: "Hacker News";
    readonly examples: ["Monitor threads about AI agents, evals, infrastructure, and startups.", "Capture notable discussions and links related to my research topics."];
    readonly id: "hackernews";
    readonly instructions: ["No account setup is required for Hacker News.", "OpenWiki uses public Hacker News feed and search APIs.", "Describe the topics, keywords, users, or story types OpenWiki should watch on the next screen."];
    readonly secretInputs: [];
}, {
    readonly authProvider: "x";
    readonly displayName: "X / Twitter";
    readonly examples: ["Track my home timeline, bookmarks, and key lists.", "Summarize tweets from AI researchers and product announcements."];
    readonly id: "x";
    readonly instructions: ["Create an X OAuth 2.0 app.", "Use a native app or public client when possible.", "Add http://127.0.0.1:53682/callback as a callback URI.", "Paste the OAuth client ID below."];
    readonly secretInputs: [{
        readonly envKey: "OPENWIKI_X_CLIENT_ID";
        readonly label: "X OAuth client ID";
    }];
}];
export declare const CRON_MODE_OPTIONS: readonly ["Use suggested schedule", "Enter custom cron"];
export declare const POWER_MODE_OPTIONS: readonly ["Set up Mac wake/sleep window", "Skip power setup"];
export declare const CRON_FIELD_LABELS: string[];
export declare const SOURCE_CONTINUE_OPTIONS: readonly ["Go back to connections", "Continue without all sources"];
export declare const FINAL_OPTIONS: readonly ["Run ingestion now", "Run later"];
export declare const CODE_REPO_OPTIONS: readonly ["Confirm and continue", "Edit path"];
/**
 * Progress glyph per status: a check for done, an arrow for the active row, a
 * hollow circle for not-started (and optional). Single cell wide so every row's
 * label column lines up without padding the marker.
 */
export declare const STEP_GLYPH: Record<SetupStepState, string>;
/** Color per status. Optionality is conveyed by the detail text, not the glyph. */
export declare const STEP_COLOR: Record<SetupStepState, string>;
