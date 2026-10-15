// src/shared/chess/util/engineregistry.ts

/**
 * The centralized data structure for all engines, and the config shape each one's
 * worker expects.
 */

// Engine Entry ----------------------------------------------------------------

/** A single engine entry object in the engine dictionary. */
interface Engine {
	/**
	 * The number of milliseconds the engine thinks when Time Control is unlimited.
	 * May vary from engine to engine because of different engine speeds and requirements.
	 */
	defaultTimeLimitPerMoveMillis: number;
	/** The English name, for ICN metadata and {@link getVersionedName}. */
	englishName: string;
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

/** Union of all valid engine names, derived from the keys of {@link REGISTRY}. */
export type ValidEngine = keyof typeof REGISTRY;

// Engine Assets ---------------------------------------------------------------

/**
 * The hashed asset URLs a page needs to boot an engine worker. Workers can't
 * resolve the asset manifest themselves, so the server hands these to the page.
 */
export interface EngineAssets {
	/** Hashed URL of the worker script hosting the engine. */
	workerUrl: string;
	/** Content-versioned URL of the unbundled engine glue (`/engine/<hash>/apeiron.js`). */
	engineUrl: string;
}

// Engine Config ---------------------------------------------------------------

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

// Constants -------------------------------------------------------------------

/**
 * Centralized data structure for all engine properties.
 * Add a new entry here when adding a new engine.
 */
const REGISTRY = {
	engineCheckmatePractice: {
		defaultTimeLimitPerMoveMillis: 500,
		englishName: 'Practice Bot',
		maxStrengthLevel: 1,
		hasGlue: false,
		needsMoveHistory: false,
	},
	apeiron: {
		defaultTimeLimitPerMoveMillis: 4000,
		englishName: 'Apeiron',
		maxStrengthLevel: 8,
		hasGlue: true,
		needsMoveHistory: true,
	},
} satisfies { [key: string]: Engine };

// Functions -------------------------------------------------------------------

/**
 * An engine's English name for ICN metadata, e.g. "Apeiron (Level 3)".
 * Notation never translates; `playername.ts` derives the display name.
 */
function getEnglishName(engineName: ValidEngine, strengthLevel: number): string {
	const name = REGISTRY[engineName].englishName;
	return isMaxStrength(engineName, strengthLevel) ? name : `${name} (Level ${strengthLevel})`;
}

/** Whether a strength level is the engine's maximum, which its name omits. */
function isMaxStrength(engineName: ValidEngine, strengthLevel: number): boolean {
	return strengthLevel === REGISTRY[engineName].maxStrengthLevel;
}

/**
 * Appends an engine's major.minor version to its display name (lila-style),
 * e.g. "Apeiron 2.1" — or just the bare name when the version is empty
 * (e.g. an engine-release fetch failed at build time).
 */
function getVersionedName(engineName: ValidEngine, version: string): string {
	const name = REGISTRY[engineName].englishName;
	return version ? `${name} ${formatVersionMajorMinor(version)}` : name;
}

/** Trims a semver to major.minor, dropping a zero minor too, e.g. "2.0.1" -> "2", "2.1.0" -> "2.1". */
function formatVersionMajorMinor(version: string): string {
	const [major, minor] = version.split('.');
	if (major === undefined || minor === undefined || minor === '0') return major ?? version;
	return `${major}.${minor}`;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	REGISTRY,
	// Functions
	getEnglishName,
	isMaxStrength,
	getVersionedName,
};
