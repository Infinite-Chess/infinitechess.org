// src/shared/chess/variants/variantreader.ts

/**
 * Reads pre-loaded VariantModules to generate moveset and special-move
 * properties. This is the heavyweight counterpart to variantpreviewer —
 * it imports movesets and specialmove and should only be pulled in by
 * code paths that actually execute game logic (boardinit, server, etc.).
 */

import type { VariantModule } from './variant_scripts/variantutil.js';
import type { RawType, RawTypeGroup } from '../util/typeutil.js';
import type { Movesets, PieceMoveset } from '../logic/movesets.js';
import type { SpecialMoveFunction, SpecialVicinity } from '../logic/specialmove.js';

import jsutil from '../../util/jsutil.js';
import movesets from '../logic/movesets.js';
import specialmove from '../logic/specialmove.js';

// Functions ------------------------------------------------------------------

/**
 * Gets the piece movesets for the given variant module.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 * @param slideLimit - If provided, overrides the slideLimit gamerule of the variant. Only meaningful for variants without a movesetGenerator (i.e. those that use default movesets), because custom movesets define their own slide ranges explicitly and don't inherit a global slide limit.
 * @returns The pieceMovesets property of the gamefile.
 */
function getMovesetsOfVariant(
	mod: VariantModule | undefined,
	slideLimit?: bigint,
): RawTypeGroup<() => PieceMoveset> {
	// Pasted games with no variant specified use the default movesets
	if (mod === undefined) return getMovesets(undefined, slideLimit);

	if (mod.genMovesetModifications) {
		const movesetModifications = mod.genMovesetModifications();
		return getMovesets(movesetModifications, slideLimit);
	} else {
		// No custom moveset generator, so just get the default movesets
		return getMovesets(undefined, slideLimit);
	}
}

/**
 * Returns default movesets with provided modifications such that each piece contains a function returning a copy of its moveset (to avoid modifying originals).
 * Any piece type present in the modifications will replace the default move that for that piece.
 * The slidelimit gamerule will only be applied to default movesets, not modified ones.
 * @param movesetModifications - The modifications to the default movesets.
 * @param [defaultSlideLimitForOldVariants] Optional. The slidelimit to use for default movesets, if applicable.
 * @returns The pieceMovesets property of the gamefile.
 */
function getMovesets(
	movesetModifications: Movesets = {},
	defaultSlideLimitForOldVariants?: bigint,
): RawTypeGroup<() => PieceMoveset> {
	const origMoveset = movesets.getPieceDefaultMovesets(defaultSlideLimitForOldVariants);
	// The running piece movesets property of the gamefile.
	const pieceMovesets: RawTypeGroup<() => PieceMoveset> = {};

	for (const [piece, moves] of Object.entries(origMoveset)) {
		const intPiece = Number(piece) as RawType;
		pieceMovesets[intPiece] = movesetModifications[intPiece]
			? (): PieceMoveset => jsutil.deepCopyObject(movesetModifications[intPiece]!)
			: (): PieceMoveset => jsutil.deepCopyObject(moves);
	}

	return pieceMovesets;
}

/**
 * Returns the special moves for the given variant module.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 */
function getSpecialMovesOfVariant(
	mod: VariantModule | undefined,
): RawTypeGroup<SpecialMoveFunction> {
	const defaultSpecialMoves = jsutil.deepCopyObject(specialmove.defaultSpecialMoves);
	// Pasted games with no variant specified use the default
	if (mod === undefined) return defaultSpecialMoves;

	const overrides = mod.getSpecialMoves?.();
	if (overrides === undefined) return defaultSpecialMoves;
	jsutil.copyPropertiesToObject(overrides, defaultSpecialMoves);
	return defaultSpecialMoves;
}

/**
 * Returns the special vicinity for the given variant module.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 */
function getSpecialVicinityOfVariant(mod: VariantModule | undefined): SpecialVicinity {
	const defaultSpecialVicinityByPiece = specialmove.getDefaultSpecialVicinitiesByPiece();
	// Pasted games with no variant specified use the default
	if (mod === undefined) return defaultSpecialVicinityByPiece;

	const overrides = mod.getSpecialVicinity?.();
	if (overrides === undefined) return defaultSpecialVicinityByPiece;
	jsutil.copyPropertiesToObject(overrides, defaultSpecialVicinityByPiece);
	return defaultSpecialVicinityByPiece;
}

// Exports ------------------------------------------------------------------

export default {
	getMovesetsOfVariant,
	getSpecialMovesOfVariant,
	getSpecialVicinityOfVariant,
};
