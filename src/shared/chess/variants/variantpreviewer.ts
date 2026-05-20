// src/shared/chess/variants/variantpreviewer.ts

/**
 * Reads pre-loaded VariantModules to generate game rules, starting positions,
 * and annotation presets. Contains only the lightweight subset of variant
 * reading needed for preview and server validation — no moveset or special-move
 * logic is imported here.
 */

import type { BaseRay } from '../../util/math/geometry.js';
import type { GameRules } from '../util/gamerules.js';
import type { PlayerGroup } from '../util/typeutil.js';
import type { CoordsKey, Coords } from '../util/coordutil.js';
import type { GameruleWinCondition } from '../util/winconutil.js';
import type { VariantModule, GameRuleModifications } from './variant_scripts/variantutil.js';

import jsutil from '../../util/jsutil.js';
import icnconverter from '../logic/icn/icnconverter.js';
import { players as p } from '../util/typeutil.js';
import { DEFAULT_PROMOTION_PIECES } from './variant_scripts/defaultPromotions.js';

// Constants ------------------------------------------------------------------

const defaultWinConditions: PlayerGroup<GameruleWinCondition[]> = {
	[p.WHITE]: ['checkmate'],
	[p.BLACK]: ['checkmate'],
};
const defaultTurnOrder = [p.WHITE, p.BLACK];
const defaultPromotionRanks = { [p.WHITE]: [8n], [p.BLACK]: [1n] };

// Functions ------------------------------------------------------------------

/**
 * Given the variant module and timestamp, calculates the starting position and specialRights.
 * @param mod - The loaded variant module.
 * @param timestamp - The game's start timestamp in ms since epoch.
 * @returns An object containing 2 properties: `position`, and `specialRights`.
 */
function getStartingPositionOfVariant(
	mod: VariantModule,
	timestamp: number,
): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	// eslint-disable-next-line prefer-const
	let { position, specialRights } = mod.getPosition(timestamp);

	if (mod.getGeneratorRules) {
		// Generator-based: derive specialRights from the module's rules
		const rules = mod.getGeneratorRules();
		specialRights = icnconverter.generateSpecialRights(
			position,
			rules.pawnDoublePush,
			rules.castleWith,
		);
		return { position, specialRights };
	} else {
		// String-based: specialRights were parsed from the position string
		return {
			position: position,
			specialRights: specialRights!, // Always available for string-based variants,
		};
	}
}

/**
 * Returns the variant's gamerules at the provided timestamp.
 * If the variant is specified but doesn't have any modifications -> default gamerules.
 * If the variant is not specified -> blank slate, zero gamerules.
 * @param timestamp - The game's start timestamp in ms since epoch.
 */
function getGameRulesOfVariant(mod: VariantModule | undefined, timestamp?: number): GameRules {
	const gameruleModifications: GameRuleModifications = mod
		? (mod.gameruleModifications?.(timestamp) ?? {})
		: { promotion: null, moveRule: null };
	return getGameRules(jsutil.deepCopyObject(gameruleModifications));
}

/** Returns the bare-minimum gamerules a game needs to function. */
function getBareMinimumGameRules(): GameRules {
	return getGameRulesOfVariant(undefined); // Erase the defaults to end up with only the required's
}

/**
 * Returns default gamerules with provided modifications
 * @param modifications - The modifications to the default gamerules.
 * @returns The gamerules
 */
function getGameRules(modifications: GameRuleModifications = {}): GameRules {
	// { slideLimit, promotionRanks, position }
	const gameRules: GameRules = {
		// REQUIRED gamerules
		winConditions: modifications.winConditions ?? defaultWinConditions,
		turnOrder: modifications.turnOrder ?? defaultTurnOrder,
	};

	// GameRules that have a dedicated ICN spot...
	if (modifications.promotion !== null) {
		gameRules.promotion = {
			ranks: modifications.promotion?.ranks ?? defaultPromotionRanks,
			pieces: modifications.promotion?.pieces ?? DEFAULT_PROMOTION_PIECES,
		};
	}
	if (modifications.moveRule !== null) gameRules.moveRule = modifications.moveRule || 100;

	return jsutil.deepCopyObject(gameRules); // Copy it so the game doesn't modify the values in this module.
}

/**
 * Returns the worldBorder property for the given variant module, if it has one.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 */
function getVariantWorldBorder(mod: VariantModule | undefined): bigint | undefined {
	if (mod === undefined) return undefined;
	return mod.worldBorderDist;
}

/**
 * Returns the length of the position string for the given variant module at the specified timestamp,
 * or `undefined` if the variant uses a generator (no fixed position string).
 * @param mod - The loaded variant module.
 * @param timestamp - The game's start timestamp in ms since epoch.
 */
function getVariantPositionStringLength(mod: VariantModule, timestamp: number): number | undefined {
	return mod.getPositionStringLength?.(timestamp);
}

/**
 * Returns the preset square annotations for the given variant module, if any.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 */
function getSquarePresets(mod: VariantModule | undefined): Coords[] {
	if (mod === undefined) return [];
	const squarePresets = mod.getAnnotePresets?.()?.squares;
	return squarePresets ? icnconverter.parsePresetSquares(squarePresets) : [];
}

/**
 * Returns the preset ray annotations for the given variant module, if any.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 */
function getRayPresets(mod: VariantModule | undefined): BaseRay[] {
	if (mod === undefined) return [];
	const rayPresets = mod.getAnnotePresets?.()?.rays;
	return rayPresets ? icnconverter.parsePresetRays(rayPresets) : [];
}

// Exports ------------------------------------------------------------------

export default {
	getStartingPositionOfVariant,
	getGameRulesOfVariant,
	getBareMinimumGameRules,
	getVariantWorldBorder,
	getVariantPositionStringLength,
	getSquarePresets,
	getRayPresets,
};
