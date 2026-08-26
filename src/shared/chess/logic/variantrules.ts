// src/shared/chess/logic/variantrules.ts

/**
 * Reads a pre-loaded VariantModule for what a game is set UP with: its gamerules,
 * starting position, and annotation presets.
 *
 * How its pieces MOVE is read by boardinit.ts instead.
 */

import type { BaseRay } from '../../util/math/geometry.js';
import type { GameRules } from '../util/gamerules.js';
import type { LoadedVariant } from './gamefile.js';
import type { Player, RawType } from '../../util/typeutil.js';
import type { CoordsKey, Coords } from '../../util/coordutil.js';
import type { VariantModule, GameRuleModifications } from './variantmodule.js';

import jsutil from '../../util/jsutil.js';
import bimath from '../../util/math/bimath.js';
import typeutil from '../../util/typeutil.js';
import coordutil from '../../util/coordutil.js';
import gamerules from '../util/gamerules.js';
import castlingutil from './castlingutil.js';
import icnconverter from './icn/icnconverter.js';
import { rawTypes as r } from '../../util/typeutil.js';

// Functions -------------------------------------------------------------------

/** Calculates the starting position and specialRights of a loaded variant. */
function getStartingPositionOfVariant(variant: LoadedVariant): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	// eslint-disable-next-line prefer-const
	let { position, specialRights } = variant.mod.getPosition(variant.dateTimestamp);

	if (variant.mod.getGeneratorRules) {
		// Generator-based: derive specialRights from the module's rules
		const rules = variant.mod.getGeneratorRules();
		specialRights = generateSpecialRights(position, rules.pawnDoublePush, rules.castleWith);
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
 * Derives the specialRights of a position built in code, which carries no '+' marks of its own.
 * Only gives pieces that can castle their right if they are on the same rank, and color, as the king, and at least 3 squares away
 * @param position - The starting position of the gamefile, in the form 'x,y':'pawnsW'
 * @param pawnDoublePush - Whether pawns are allowed to double push
 * @param castleWith - If castling is allowed, this is what piece the king can castle with (e.g., "rooks"), otherwise leave it undefined
 * @returns The specialRights gamefile property, a set where entries are coordsKeys 'x,y', where the piece at that location has their special move ability (pawn double push, castling rights..)
 */
function generateSpecialRights(
	position: Map<CoordsKey, number>,
	pawnDoublePush: boolean,
	castleWith?: RawType,
): Set<CoordsKey> {
	// Make sure castleWith is with a valid piece to castle with
	if (castleWith !== undefined && castleWith !== r.ROOK && castleWith !== r.GUARD)
		throw Error(`Cannot allow castling with ${typeutil.debugType(castleWith)}!.`);

	const specialRights = new Set<CoordsKey>();
	if (pawnDoublePush === false && castleWith === undefined) return specialRights; // Early exit

	/** Running list of kings discovered, 'x,y': player */
	const kingsFound: Record<CoordsKey, Player> = {};
	/** Running list of pieces found that are able to castle (e.g. rooks), 'x,y': Player */
	const castleWithsFound: Record<CoordsKey, Player> = {};

	for (const [key, thisPiece] of position.entries()) {
		const [rawType, player] = typeutil.splitType(thisPiece);
		if (pawnDoublePush && rawType === r.PAWN) {
			specialRights.add(key);
		} else if (castleWith && typeutil.jumpingRoyals.includes(rawType)) {
			specialRights.add(key);
			kingsFound[key] = player;
		} else if (castleWith && rawType === castleWith) {
			castleWithsFound[key] = player;
		}
	}

	// Only give the pieces that can castle their special move ability
	// if they are the same row and color as a king!
	if (Object.keys(kingsFound).length === 0) return specialRights; // Nothing can castle, return now.
	outerFor: for (const coord in castleWithsFound) {
		// 'x,y': player
		const coords = coordutil.getCoordsFromKey(coord as CoordsKey); // [x,y]
		for (const kingCoord in kingsFound) {
			// 'x,y': player
			const kingCoords = coordutil.getCoordsFromKey(kingCoord as CoordsKey); // [x,y]
			if (coords[1] !== kingCoords[1]) continue; // Not the same y level
			if (castleWithsFound[coord as CoordsKey] !== kingsFound[kingCoord as CoordsKey])
				continue; // Their players don't match
			const xDist = bimath.abs(coords[0] - kingCoords[0]);
			if (xDist < castlingutil.MIN_DISTANCE) continue; // Not at least minimum distance away
			specialRights.add(coord as CoordsKey); // Same row and color as the king! This piece can castle.
			// We already know this piece can castle, we don't
			// need to see if it's on the same rank as any other king
			continue outerFor;
		}
	}
	return specialRights;
}

/**
 * Returns the variant's gamerules.
 * If the variant is specified but doesn't have any modifications -> default gamerules.
 * If the variant is not specified -> blank slate, zero gamerules.
 */
function getGameRulesOfVariant(variant: LoadedVariant | undefined): GameRules {
	const gameruleModifications: GameRuleModifications = variant
		? (variant.mod.gameruleModifications?.(variant.dateTimestamp) ?? {})
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
		winConditions: modifications.winConditions ?? gamerules.DEFAULT_WIN_CONDITIONS,
		turnOrder: modifications.turnOrder ?? gamerules.DEFAULT_TURN_ORDER,
	};

	// GameRules that have a dedicated ICN spot...
	if (modifications.promotion !== null) {
		gameRules.promotion = {
			ranks: modifications.promotion?.ranks ?? gamerules.DEFAULT_PROMOTION_RANKS,
			pieces: modifications.promotion?.pieces ?? gamerules.DEFAULT_PROMOTION_PIECES,
		};
	}
	if (modifications.moveRule !== null) gameRules.moveRule = modifications.moveRule || 100;
	if (modifications.worldBorder !== undefined) gameRules.worldBorder = modifications.worldBorder;

	return jsutil.deepCopyObject(gameRules); // Copy it so the game doesn't modify the values in this module.
}

/**
 * Returns the length of the position string for the loaded variant,
 * or `undefined` if the variant uses a generator (no fixed position string).
 */
function getVariantPositionStringLength(variant: LoadedVariant): number | undefined {
	return variant.mod.getPositionStringLength?.(variant.dateTimestamp);
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

// Exports ---------------------------------------------------------------------

export default {
	getStartingPositionOfVariant,
	getGameRulesOfVariant,
	getBareMinimumGameRules,
	getVariantPositionStringLength,
	getSquarePresets,
	getRayPresets,
};
