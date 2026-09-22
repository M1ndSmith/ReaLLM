import type { BuildChannel } from "./types.js";
/**
 * The distribution channel this build was produced for (see {@link BuildChannel}).
 * `"official"` only for npm-published upstream builds, `"community"` for
 * everything else (forks, local builds, source/dev runs). Stamped on every event
 * so fork-originated telemetry can be filtered out from the official-release
 * signal.
 */
export declare function buildChannel(): BuildChannel;
/**
 * True when the user has opted out via OpenWiki's switch or DO_NOT_TRACK.
 */
export declare function isTelemetryDisabled(): boolean;
/**
 * True in CI / scheduled contexts. CI runs are still captured, but tagged
 * `execution: "ci"` and sent under the sentinel id so they never inflate human
 * install counts. Detection is delegated to `ci-info`. `OPENWIKI_SCHEDULED` is
 * an explicit escape hatch for our own automation.
 */
export declare function isCiEnvironment(): boolean;
/**
 * Fixed distinct id for CI runs, namespaced by provider (e.g. "ci-github-actions").
 * Deliberately NOT unique: collapsing every CI run to one id per provider keeps
 * ephemeral runners from exploding the distinct count.
 */
export declare function ciSentinelId(): string;
/**
 * Whether the first-run notice is suppressed. Distinct from the send gate the
 * notice is skipped in CI, but events are still sent in CI. Only an explicit
 * opt-out stops sending.
 */
export declare function noticeSuppressed(): boolean;
/**
 * True when running the compiled, published build (from `dist/`); false when
 * running from source (`src/` via tsx, or under vitest). Stamped on every event
 * as `production` so real installed-package usage can be separated from local
 * dev/test runs. Deliberately based on build origin, not `NODE_ENV` — that var
 * is common in developers' own shells and would misclassify real users.
 */
export declare function isProductionBuild(): boolean;
