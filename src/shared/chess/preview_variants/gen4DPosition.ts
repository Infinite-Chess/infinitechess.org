// src/shared/chess/preview_variants/gen4DPosition.ts

import type { CoordsKey } from '../util/coordutil.js';

import coordutil from '../util/coordutil.js';
import icnconverter from '../logic/icn/icnconverter.js';
import { rawTypes as r, ext as e } from '../util/typeutil.js';

// Types -------------------------------------------------------------------------------

/** An object that contains all relevant quantities for the size of a single 4D chess board. */
export type Dimensions = {
	/** The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1 */
	BOARD_SPACING: bigint;
	/** Board edges on the real chessboard */
	MIN_X: bigint;
	/** Board edges on the real chessboard */
	MAX_X: bigint;
	/** Board edges on the real chessboard */
	MIN_Y: bigint;
	/** Board edges on the real chessboard */
	MAX_Y: bigint;
};

// Functions -------------------------------------------------------------------------------

function getDimensions(boards_x: bigint, boards_y: bigint, board_spacing: bigint): Dimensions {
	const MIN_X = 0n;
	const MIN_Y = 0n;
	return {
		BOARD_SPACING: board_spacing,
		MIN_X,
		MAX_X: MIN_X + boards_x * board_spacing,
		MIN_Y,
		MAX_Y: MIN_Y + boards_y * board_spacing,
	};
}

/**
 * Generate 4D chess position
 * @param boards_x - Number of 2D boards in x direction
 * @param boards_y - Number of 2D boards in y direction
 * @param board_spacing - The spacing of the 2D boards - should be equal to (sidelength of a 2D board) + 1
 * @param input_position - If this is a position string, populate all 2D boards with it. If it is a dictionary, populate the boards according to it
 */
function gen(
	boards_x: bigint,
	boards_y: bigint,
	board_spacing: bigint,
	input_position: string | { [key: string]: string },
): Map<CoordsKey, number> {
	const dim = getDimensions(boards_x, boards_y, board_spacing);
	const resultPos = new Map<CoordsKey, number>();

	// position is string and should identically populate all 2D boards
	if (typeof input_position === 'string') {
		const input_position_long: Map<CoordsKey, number> =
			icnconverter.generatePositionFromShortForm(input_position).position;

		for (let i = dim.MIN_X; i <= dim.MAX_X; i++) {
			for (let j = dim.MIN_Y; j <= dim.MAX_Y; j++) {
				// Only the edges of boards should be voids
				if (i % dim.BOARD_SPACING === 0n || j % dim.BOARD_SPACING === 0n) {
					resultPos.set(coordutil.getKeyFromCoords([i, j]), r.VOID + e.N);
					// Add input_position_long to the board
					if (
						i < dim.MAX_X &&
						i % dim.BOARD_SPACING === 0n &&
						j < dim.MAX_Y &&
						j % dim.BOARD_SPACING === 0n
					) {
						for (const [key, value] of input_position_long) {
							const coords = coordutil.getCoordsFromKey(key);
							const newKey = coordutil.getKeyFromCoords([
								coords[0] + i,
								coords[1] + j,
							]);
							resultPos.set(newKey, value);
						}
					}
				}
			}
		}
	}
	// position is object and should populate 2D boards according to its entries
	else if (typeof input_position === 'object') {
		// Loop through from the leftmost column that should be voids to the right most, and also vertically
		for (let i = dim.MIN_X; i <= dim.MAX_X; i++) {
			for (let j = dim.MIN_Y; j <= dim.MAX_Y; j++) {
				// Only the edges of boards should be voids
				if (
					i % dim.BOARD_SPACING === 0n ||
					i % dim.BOARD_SPACING === 9n ||
					j % dim.BOARD_SPACING === 0n ||
					j % dim.BOARD_SPACING === 9n
				) {
					resultPos.set(coordutil.getKeyFromCoords([i, j]), r.VOID + e.N);
					// Add the subposition to the correct board
					if (
						i < dim.MAX_X &&
						i % dim.BOARD_SPACING === 0n &&
						j < dim.MAX_Y &&
						j % dim.BOARD_SPACING === 0n
					) {
						const sub_position_short =
							input_position[`${i / dim.BOARD_SPACING},${j / dim.BOARD_SPACING}`];
						const sub_position_long: Map<CoordsKey, number> = sub_position_short
							? icnconverter.generatePositionFromShortForm(sub_position_short)
									.position
							: new Map<CoordsKey, number>();
						for (const [key, value] of sub_position_long) {
							const coords = coordutil.getCoordsFromKey(key);
							const newKey = coordutil.getKeyFromCoords([
								coords[0] + i,
								coords[1] + j,
							]);
							resultPos.set(newKey, value);
						}
					}
				}
			}
		}
	}

	return resultPos;
}

// Exports ------------------------------------------

export default { getDimensions, gen };
