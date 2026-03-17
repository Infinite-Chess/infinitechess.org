// src/client/scripts/esm/game/chess/engines/engine.ts

/*
 * This module contains the centralized data structure for all engines.
 * Add a new entry to engineDictionary when adding a new engine.
 */

import hydrochess_card from './enginecards/hydrochess_card.js';

// Types ------------------------------------------------------------------------

/** A single engine entry object in the engine dictionary. */
export interface Engine {
	/**
	 * World border distance for this engine.
	 * Engine games have a world border enabled so as to keep the position within safe floating point range.
	 * If the variant's world border is smaller, that will be used instead.
	 */
	worldBorder: bigint;
	/**
	 * The number of milliseconds the engine thinks when Time Control is unlimited.
	 * May vary from engine to engine because of different engine speeds and requirements.
	 */
	defaultTimeLimitPerMoveMillis: number;
	/** Display name shown in the UI for this engine. */
	displayName: string;
	/** The maximum strength level supported by this engine. */
	maxStrengthLevel: number;
}

/** Union of all valid engine names, derived from the keys of engineDictionary. */
export type ValidEngine = keyof typeof engineDictionary;

// Constants --------------------------------------------------------------------

/**
 * Centralized data structure for all engine properties.
 * Add a new entry here when adding a new engine.
 */
export const engineDictionary = {
	engineCheckmatePractice: {
		// worldBorder: BigInt(Number.MAX_SAFE_INTEGER), // FREEZES practice checkmate engine if you move to the border
		worldBorder: BigInt(1e15), // 1 Quadrillion (~11% the distance of Number.MAX_SAFE_INTEGER)
		defaultTimeLimitPerMoveMillis: 500,
		displayName: 'Practice Bot',
		maxStrengthLevel: 1,
	},
	hydrochess: {
		worldBorder: hydrochess_card.I64_MAX - 2000n,
		defaultTimeLimitPerMoveMillis: 4000,
		displayName: 'HydroChess',
		maxStrengthLevel: 3,
	},
} satisfies { [key: string]: Engine };

// Functions --------------------------------------------------------------------

/**
 * Returns a formatted engine name string, optionally including its strength level.
 * If the provided strength level is the maximum for the engine, it is omitted.
 */
export function getFormattedEngineName(engineName: ValidEngine, strengthLevel?: number): string {
	const name = engineDictionary[engineName].displayName;
	const maxLevel = engineDictionary[engineName].maxStrengthLevel;
	return strengthLevel !== undefined && strengthLevel !== maxLevel
		? `${name} (Level ${strengthLevel})`
		: name;
}
