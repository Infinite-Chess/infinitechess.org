// src/shared/chess/logic/initvariant.ts

/**
 * This script prepares our variant when a game is constructed
 */

import type { Snapshot } from './gamefile.js';
import type { GameRules } from '../util/gamerules.js';
import type { CoordsKey } from '../util/coordutil.js';
import type { VariantCode } from '../variants/variant.js';
import type { PieceMoveset } from './movesets.js';
import type { RawTypeGroup } from '../util/typeutil.js';
import type { GlobalGameState } from './state.js';
import type { SpecialMoveFunction } from './specialmove.js';

import variant from '../variants/variant.js';

/**
 * Variant options that can be used to load a custom game,
 * whether local or online, instead of one of the default variants.
 */
interface VariantOptions {
	/**
	 * The full move number of the turn at the provided position. Default: 1.
	 * Can be higher if you copy just the positional information in a game with some moves played already.
	 */
	fullMove: number;
	gameRules: GameRules;
	/**
	 * The starting position object, containing the pieces organized by key.
	 * The key of the object is the coordinates of the piece as a string,
	 * and the value is the type of piece on that coordinate (e.g. [22] pawn (neutral))
	 */
	position: Map<CoordsKey, number>;
	/** The 3 global game states */
	state_global: GlobalGameState;
}

/**
 * Returns the game rules for the variant.
 * If variant options are provided, their embedded gameRules are used directly.
 * @param variantCode - The variant code, or null for custom/pasted positions.
 * @param timestamp - The game's start timestamp in ms since epoch.
 * @param [options] - Variant options that override the default variant gamerules.
 */
function getVariantGamerules(
	variantCode: VariantCode | null,
	timestamp: number,
	options?: VariantOptions,
): GameRules {
	// Ignores the variant code, and just uses the specified gameRules
	if (options) return options.gameRules;
	// Default (built-in variant, not pasted)
	if (variantCode === null) return variant.getBareMinimumGameRules();
	return variant.getGameRulesOfVariant(variantCode, timestamp);
}

/**
 * Returns the piece movesets and special moves for the variant.
 * @param variantCode - The variant code, or null for custom/pasted positions.
 * @param timestamp - The game's start timestamp in ms since epoch.
 * @param [slideLimit] - Overrides the slideLimit gamerule of the variant, if specified.
 */
function getPieceMovesets(
	variantCode: VariantCode | null,
	timestamp: number,
	slideLimit?: bigint,
): {
	pieceMovesets: RawTypeGroup<() => PieceMoveset>;
	specialMoves: RawTypeGroup<SpecialMoveFunction>;
} {
	const pieceMovesets = variant.getMovesetsOfVariant(variantCode, timestamp, slideLimit);
	const specialMoves = variant.getSpecialMovesOfVariant(variantCode, timestamp);
	return {
		pieceMovesets,
		specialMoves,
	};
}

/**
 * Fills in any holes in the provided variant options with the variant defaults.
 * @param variantCode - The variant code, or null for custom/pasted positions.
 * @param timestamp - The game's start timestamp in ms since epoch.
 * @param [variantOptions] - The variant options. If position is not specified, the variant code must be provided.
 */
function getVariantVariantOptions(
	gamerules: GameRules,
	variantCode: VariantCode | null,
	timestamp: number,
	variantOptions?: VariantOptions,
): {
	position: Snapshot['position'];
	state_global: Snapshot['state_global'];
	fullMove: number;
} {
	let position: Snapshot['position'];
	let fullMove: Snapshot['fullMove'];
	// The 3 global game states
	let specialRights: Snapshot['state_global']['specialRights'];
	let enpassant: Snapshot['state_global']['enpassant'];
	let moveRuleState: Snapshot['state_global']['moveRuleState'];

	// Even IF options are provided. If the pasted game doesn't contain position information
	// then we still have to grab it from the variant!
	if (variantOptions) {
		position = variantOptions.position;
		fullMove = variantOptions.fullMove;
		specialRights = variantOptions.state_global.specialRights;
		enpassant = variantOptions.state_global.enpassant;
		if (
			variantOptions.gameRules.moveRule !== undefined &&
			variantOptions.state_global.moveRuleState === undefined
		)
			throw Error('If moveRule is specified, moveRuleState must also be specified.');
		moveRuleState = variantOptions.state_global.moveRuleState;
	} else if (variantCode !== null) {
		({ position, specialRights } = variant.getStartingPositionOfVariant(
			variantCode,
			timestamp,
		));
		fullMove = 1; // Every variant has the exact same fullMove value.
		if (gamerules.moveRule !== undefined) moveRuleState = 0; // Every variant has the exact same initial moveRuleState value.
	} else throw Error('Cannot get starting position without a variant code or variant options.');

	// console.log("Variant options:", variantOptions);

	const state_global: Snapshot['state_global'] = { specialRights };
	if (enpassant) state_global.enpassant = enpassant;
	if (moveRuleState !== undefined) state_global.moveRuleState = moveRuleState;

	return {
		position,
		state_global,
		fullMove,
	};
}

export type { VariantOptions };

export default {
	getVariantGamerules,
	getPieceMovesets,
	getVariantVariantOptions,
};
