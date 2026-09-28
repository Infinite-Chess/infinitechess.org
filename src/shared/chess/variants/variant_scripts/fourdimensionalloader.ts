// src/shared/chess/variants/variant_scripts/fourdimensionalloader.ts

/**
 * This script dynamically generates the moveset and specialVicinity
 * overrides of 4 dimensional variants with varying number of boards,
 * board sizes, and positions on each board.
 */

import type { Coords } from '../../../util/coordutil.js';
import type { Movesets, RawMovesets } from '../../logic/movesets.js';

import bimath from '../../../util/math/bimath.js';
import movesets from '../../logic/movesets.js';
import coordutil from '../../../util/coordutil.js';
import gen4dposition from './gen4dposition.js';
import { rawTypes as r } from '../../util/typeutil.js';
import fourdimensionalmoves from '../../logic/fourdimensionalmoves.js';

// Moveset Overrides -----------------------------------------------------------
/**
 * Generates the moveset for the sliding pieces
 * @param boards_x - Number of 2D boards in x direction
 * @param boards_y - Number of 2D boards in y direction
 * @param board_spacing - The spacing of the 2D boards - should be equal to (sidelength of a 2D board) + 1
 * @param strong_kings_and_queens - true: allow quadragonal and triagonal movement. false: do not allow it
 * @param strong_pawns - true: pawns can capture along any diagonal. false: pawns can only capture along strictly spacelike or timelike diagonals
 * @returns
 */
function gen4DMoveset(
	boards_x: bigint,
	boards_y: bigint,
	board_spacing: bigint,
	strong_kings_and_queens: boolean,
	strong_pawns: boolean,
): Movesets {
	const dim = gen4dposition.getDimensions(boards_x, boards_y, board_spacing);

	const rawMovesets: RawMovesets = {
		[r.QUEEN]: {
			individual: [],
			sliding: {},
		},
		[r.BISHOP]: {
			individual: [],
			sliding: {},
		},
		[r.ROOK]: {
			individual: [],
			sliding: {},
		},
		[r.KING]: {
			individual: [],
			special: (gamefile, coords, color, premove) =>
				fourdimensionalmoves.fourDimensionalKingMove(gamefile, coords, color, premove, dim, strong_kings_and_queens), // prettier-ignore
		},
		[r.KNIGHT]: {
			individual: [],
			special: (gamefile, coords, color, premove) =>
				fourdimensionalmoves.fourDimensionalKnightMove(gamefile, coords, color, premove, dim), // prettier-ignore
		},
		[r.PAWN]: {
			individual: [],
			special: (gamefile, coords, color, premove) =>
				fourdimensionalmoves.fourDimensionalPawnMove(gamefile, coords, color, premove, dim, strong_pawns), // prettier-ignore
		},
	};

	for (const offset of fourdimensionalmoves.offsetsWithin(1n, () => true)) {
		const [x, y] = fourdimensionalmoves.applyOffset([0n, 0n], offset, dim.BOARD_SPACING);

		if (x < 0n) continue; // If the x coordinate is negative, skip this iteration
		if (x === 0n && y <= 0n) continue; // Skip if x is 0 and y is negative
		// Add the moves

		// allow any queen move if STRONG_KINGS_AND_QUEENS, else group her with bishops and rooks
		if (strong_kings_and_queens)
			rawMovesets[r.QUEEN]!.sliding![coordutil.getKeyFromCoords([x, y])] = [null, null];

		const length = fourdimensionalmoves.lengthSquared(offset);
		// Only add a bishop move if the move moves in two dimensions
		if (length === 2n) {
			rawMovesets[r.BISHOP]!.sliding![coordutil.getKeyFromCoords([x, y])] = [null, null];
			if (!strong_kings_and_queens)
				rawMovesets[r.QUEEN]!.sliding![coordutil.getKeyFromCoords([x, y])] = [null, null];
		}
		// Only add a rook move if the move moves in one dimension
		if (length === 1n) {
			rawMovesets[r.ROOK]!.sliding![coordutil.getKeyFromCoords([x, y])] = [null, null];
			if (!strong_kings_and_queens)
				rawMovesets[r.QUEEN]!.sliding![coordutil.getKeyFromCoords([x, y])] = [null, null];
		}
	}

	return movesets.convertRawMovesetsToPieceMovesets(rawMovesets);
}

// Special Vicinity Overrides --------------------------------------------------

/**
 * Sets the specialVicinity object for the pawn
 * @param board_spacing - The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1.
 * @param strong_pawns - true: pawns can capture along any forward-sideways diagonal.
 * 						 false: pawns can only capture along strictly spacelike or timelike diagonals, like in 5D chess
 * @returns
 */
function getPawnVicinity(board_spacing: bigint, strong_pawns: boolean): Coords[] {
	const offsets = fourdimensionalmoves.offsetsWithin(1n, (offset) => {
		const { baseH, baseV, offsetH, offsetV } = offset;
		// only allow changing two things at once
		if (fourdimensionalmoves.lengthSquared(offset) !== 2n) return false;
		// do not allow two moves forward
		if (baseH * baseH + offsetH * offsetH === 2n) return false;
		// do not allow two moves sideways
		if (baseV * baseV + offsetV * offsetV === 2n) return false;
		// disallow strong captures if pawns are weak
		return (
			strong_pawns ||
			(bimath.abs(baseH) === bimath.abs(baseV) && bimath.abs(offsetH) === bimath.abs(offsetV))
		);
	});
	return offsets.map((offset) =>
		fourdimensionalmoves.applyOffset([0n, 0n], offset, board_spacing),
	);
}

/**
 * Sets the specialVicinity object for the knight
 * @param board_spacing - The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1.
 * @returns
 */
function getKnightVicinity(board_spacing: bigint): Coords[] {
	return fourdimensionalmoves.KNIGHT_OFFSETS.map((offset) =>
		fourdimensionalmoves.applyOffset([0n, 0n], offset, board_spacing),
	);
}

/**
 * Sets the specialVicinity object for the king
 * @param board_spacing - The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1.
 * @param strong_kings_and_queens - true: allow quadragonal and triagonal king and queen movement. false: do not allow it
 * @returns
 */
function getKingVicinity(board_spacing: bigint, strong_kings_and_queens: boolean): Coords[] {
	const offsets = strong_kings_and_queens
		? fourdimensionalmoves.STRONG_KING_OFFSETS
		: fourdimensionalmoves.KING_OFFSETS;
	return offsets.map((offset) =>
		fourdimensionalmoves.applyOffset([0n, 0n], offset, board_spacing),
	);
}

// Exports ---------------------------------------------------------------------

export default {
	// Moveset Overrides
	gen4DMoveset,
	// Special Vicinity Overrides
	getPawnVicinity,
	getKnightVicinity,
	getKingVicinity,
};
