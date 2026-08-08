// src/shared/chess/engine.ts

/*
 * This module contains the centralized data structure for all engines.
 * Add a new entry to engineDictionary when adding a new engine.
 */

// Types ------------------------------------------------------------------------

/** A single engine entry object in the engine dictionary. */
export interface Engine {
	/**
	 * World border distance for this engine, measured out from the piece
	 * bounding box so the border sits evenly on all sides — fair to both players.
	 * Engine games have a world border enabled so as to keep the position within safe floating point range.
	 * If the variant's own distance is smaller, that is used instead.
	 */
	worldBorderDist: bigint;
	/**
	 * The number of milliseconds the engine thinks when Time Control is unlimited.
	 * May vary from engine to engine because of different engine speeds and requirements.
	 */
	defaultTimeLimitPerMoveMillis: number;
	/** Display name shown in the UI for this engine. */
	displayName: string;
	/** The maximum strength level supported by this engine. */
	maxStrengthLevel: number;
	/** Whether the worker loads separately served wasm glue at runtime. */
	hasGlue: boolean;
	/**
	 * Whether the engine is sent the game's move history alongside the position.
	 * Engines that detect repetition or the fifty-move rule need it; those that only
	 * look at the pieces in front of them are sent the current position on its own.
	 */
	needsMoveHistory: boolean;
}

/** Union of all valid engine names, derived from the keys of engineDictionary. */
export type ValidEngine = keyof typeof engineDictionary;

// Engine Config -----------------------------------------------------------------

/** What every engine's worker is configured with when the page asks it for a move. */
export interface BaseEngineConfig {
	/** Hard time limit for the engine to think in milliseconds. */
	engineTimeLimitPerMoveMillis: number;
}

/** Config for `engineCheckmatePractice`. */
export interface CheckmatePracticeEngineConfig extends BaseEngineConfig {
	/** Which practice checkmate is being played — the engine's play is tuned per problem. */
	checkmateSelectedID: string;
}

/** Config for `apeiron`. */
export interface ApeironEngineConfig extends BaseEngineConfig {
	/** Engine strength preset, up to the entry's `maxStrengthLevel`. */
	strengthLevel: number;
}

/** An engine paired with the config its own worker expects. */
export type EngineAndConfig =
	| { name: 'engineCheckmatePractice'; config: CheckmatePracticeEngineConfig }
	| { name: 'apeiron'; config: ApeironEngineConfig };

// Constants --------------------------------------------------------------------

/** Maximum signed 64-bit integer value (2^63 - 1). Used in Rust. */
export const I64_MAX = 2n ** 63n - 1n;

/**
 * Centralized data structure for all engine properties.
 * Add a new entry here when adding a new engine.
 */
export const engineDictionary = {
	engineCheckmatePractice: {
		// worldBorderDist: BigInt(Number.MAX_SAFE_INTEGER), // FREEZES practice checkmate engine if you move to the border
		worldBorderDist: BigInt(1e15), // 1 Quadrillion (~11% the distance of Number.MAX_SAFE_INTEGER)
		defaultTimeLimitPerMoveMillis: 500,
		displayName: 'Practice Bot',
		maxStrengthLevel: 1,
		hasGlue: false,
		needsMoveHistory: false,
	},
	apeiron: {
		worldBorderDist: I64_MAX - 2000n,
		defaultTimeLimitPerMoveMillis: 4000,
		displayName: 'Apeiron',
		maxStrengthLevel: 8,
		hasGlue: true,
		needsMoveHistory: true,
	},
} satisfies { [key: string]: Engine };

// Functions --------------------------------------------------------------------

/**
 * Returns a formatted engine name string (e.g. "Apeiron (Level 3)").
 * If the provided strength level is the maximum for the engine, it is omitted.
 */
export function getFormattedEngineName(engineName: ValidEngine, strengthLevel?: number): string {
	const name = engineDictionary[engineName].displayName;
	const maxLevel = engineDictionary[engineName].maxStrengthLevel;
	return strengthLevel !== undefined && strengthLevel !== maxLevel
		? `${name} (Level ${strengthLevel})`
		: name;
}

/**
 * Appends an engine's major.minor version to its display name (lila-style),
 * e.g. "Apeiron 2.1" — or just the bare name when the version is empty
 * (e.g. an engine-release fetch failed at build time).
 */
export function getVersionedEngineName(engineName: ValidEngine, version: string): string {
	const name = engineDictionary[engineName].displayName;
	return version ? `${name} ${formatEngineVersionMajorMinor(version)}` : name;
}

/** Trims a semver to major.minor, dropping a zero minor too, e.g. "2.0.1" -> "2", "2.1.0" -> "2.1". */
function formatEngineVersionMajorMinor(version: string): string {
	const [major, minor] = version.split('.');
	if (major === undefined || minor === undefined || minor === '0') return major ?? version;
	return `${major}.${minor}`;
}
