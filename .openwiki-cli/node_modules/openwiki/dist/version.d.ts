/**
 * OpenWiki's published version, derived at runtime from `package.json` so it
 * stays in lockstep with releases without a hardcoded constant to maintain.
 */
export declare const OPENWIKI_VERSION: string;
/**
 * OpenWiki's OKF producer actor, the `by` value stamped on code-owned
 * `generated` and `verified` events (OKF v0.2 §7 `<producer>/<version>`
 * convention). Every deterministic provenance and trust projection derives
 * from this single source so actor identity cannot drift.
 */
export declare const OPENWIKI_PRODUCER_ACTOR: string;
