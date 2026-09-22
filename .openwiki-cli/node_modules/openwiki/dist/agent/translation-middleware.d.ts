import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BackendProtocolV2 } from "deepagents";
import type { OpenWikiCommand, OpenWikiOutputMode } from "./types.js";
/**
 * What an `update` run should do about the wiki's language before the agent
 * runs.
 *
 * The plan is resolved once per run and drives the translation middleware: it
 * says which language every page must end up in, which language to translate
 * from, and whether the whole wiki needs converting or only pages a prior run
 * left pending.
 */
export interface TranslationPlan {
    /**
     * The language every eligible page must end up written in, as a canonical
     * BCP-47 tag (for example `en` or `zh-CN`).
     */
    target: string;
    /**
     * The language the wiki is currently written in, used as the translation
     * source hint. Detection is best-effort: a page left pending by an earlier
     * failed switch may not actually be in this language, so the model is asked to
     * detect the real source rather than trust this blindly.
     */
    source: string;
    /**
     * When true the run must translate every page (a real language switch); when
     * false only pages carrying a pending-translation marker are retranslated, and
     * a wiki with none is left untouched.
     */
    translateAll: boolean;
}
/**
 * Resolves the translation plan for a run, or undefined when translation never
 * applies (any command other than `update`).
 *
 * OpenWiki treats the wiki's language as persisted state: an `update` inherits
 * it unless `--language` requests a different one. The target is the requested
 * language, else the persisted one, else English. A full translate-all pass is
 * warranted only when a language is explicitly requested whose primary subtag
 * differs from the persisted one; comparing primary subtags avoids a needless
 * retranslation for a region-only change such as `en` to `en-GB`. Even without a
 * switch the plan is returned for every update so the middleware can still sweep
 * pages a prior run left pending.
 */
export declare function resolveTranslationPlan(command: OpenWikiCommand, requestedLanguage: string | undefined, currentWikiLanguage: string | undefined): TranslationPlan | undefined;
/**
 * Creates middleware that brings every existing wiki page into the run's target
 * language before the agent runs.
 *
 * OpenWiki treats the wiki's language as persisted state, so an incremental
 * update alone would leave a mix of the old and new language on a switch, since
 * the agent only rewrites pages whose source changed. This `beforeAgent` hook
 * closes that gap. It is mounted on every `update` and does one of three things,
 * cheapest first: with nothing to do it only walks the tree (zero model calls);
 * on a plain update it retranslates just the pages a prior run left marked
 * `openwiki_translation_pending`; on a real language switch it retranslates every
 * page.
 *
 * The model's output is treated purely as file text and written back through the
 * sandboxed docs-only backend; it is never executed, and every path comes from
 * backend enumeration rather than model output.
 *
 * A single page's translation failure never aborts the run: the page is left in
 * its previous language, stamped with a pending marker so the next update retries
 * it, and reported through `onWarning`. `onWarning` defaults to writing the
 * (already secret-redacted) summary to stderr.
 *
 * The raw translated Markdown is kept out of the token stream (see
 * {@link NOSTREAM_TAG}); `onStatus` is called once instead, with a short line
 * announcing the pass, so the user sees progress without the flood of tokens. It
 * fires only when at least one page is actually translated, so a no-op marker
 * sweep stays silent, and defaults to writing the line to stderr.
 *
 * @param backend - Sandboxed wiki backend.
 * @param outputMode - Current output target.
 * @param model - Translation model.
 * @param plan - Resolved language transition.
 * @param onWarning - Sanitized warning sink.
 * @param onStatus - User-visible status sink.
 * @returns Translation middleware.
 */
export declare function createWikiTranslationMiddleware(backend: BackendProtocolV2, outputMode: OpenWikiOutputMode, model: BaseChatModel, plan: TranslationPlan, onWarning?: (message: string) => void, onStatus?: (message: string) => void): import("langchain").AgentMiddleware<undefined, undefined, unknown, readonly (import("@langchain/core/tools").ClientTool | import("@langchain/core/tools").ServerTool)[], readonly []>;
