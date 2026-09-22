import { CompositeBackend, type FilesystemPermission } from "deepagents";
import { OpenWikiLocalShellBackend } from "./docs-only-backend.js";
/**
 * DeepAgents' fixed history-offload mount.
 */
export declare const CONVERSATION_HISTORY_MOUNT = "/conversation_history/";
/**
 * Shared filesystem restrictions for native OpenWiki agents.
 */
export declare const AGENT_FILESYSTEM_PERMISSIONS: FilesystemPermission[];
/**
 * Optional host directories mounted into an OpenWiki agent backend.
 */
interface AgentBackendMountOptions {
    /**
     * Directory used for DeepAgents conversation-history offload.
     */
    historyDir?: string;
    /**
     * Directory containing installed OpenWiki skills.
     */
    skillsDir?: string;
}
/**
 * Mounts generated docs, conversation history, and bundled skills for an agent.
 *
 * @param wikiBackend - Worker-specific repository or local-wiki backend.
 * @param options - Optional mount overrides used by tests and isolated hosts.
 * @returns Composite backend with OpenWiki's fixed virtual mounts.
 */
export declare function createAgentBackend(wikiBackend: OpenWikiLocalShellBackend, { historyDir, skillsDir, }?: AgentBackendMountOptions): CompositeBackend;
export {};
