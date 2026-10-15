// src/client/scripts/esm/board/rendering/boardgeometry.ts

/**
 * Board geometry queries: the bounding box of the board a camera sees at a given position
 * and scale, tile widths, and square-center helpers. Pure geometry — the actual drawing of
 * the tiles (its textures & shaders) lives in the per-context {@link boardtiles}.
 */

import type { Camera } from './camera.js';
import type { BDCoords } from '../../../../../shared/util/coordutil.js';
import type { BoundingBox, BoundingBoxBD } from '../../../../../shared/util/math/bounds.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

// Constants -------------------------------------------------------------------

/** Without this, the center of tiles would be their bottom-left corner. Range: 0-1 */
const SQUARE_CENTER: number = 0.5;

// BigDecimal constants
const ONE = bd.fromBigInt(1n);

// Public API ------------------------------------------------------------------

function getSquareCenter(): BigDecimal {
	return bd.fromNumber(SQUARE_CENTER);
}

function getSquareCenterAsNumber(): number {
	return SQUARE_CENTER;
}

/**
 * Returns the width of a tile in virtual pixels at the provided board scale.
 * @param cam - The camera to measure against.
 * @param debugMode - Whether to measure against the camera's debug view. Defaults to its current state.
 */
function getTileWidthPixels(
	cam: Camera,
	scale: BigDecimal,
	debugMode = cam.getDebug(),
): BigDecimal {
	// If we're in developer mode, our screenBoundingBox is different
	const screenBoundingBox = cam.getScreenBoundingBox(debugMode);
	const factor1: BigDecimal = bd.fromNumber(
		(cam.getCanvas().height * 0.5) / screenBoundingBox.top,
	);
	const tileWidthPixels_Physical = bd.multiplyFloating(factor1, scale); // Greater for retina displays

	const divisor = bd.fromNumber(window.devicePixelRatio);
	const tileWidthPixels_Virtual = bd.divideFloating(tileWidthPixels_Physical, divisor);

	return tileWidthPixels_Virtual;
}

/**
 * Calculates the bounding box of the board visible on screen,
 * when the camera is at the specified position, up to a certain precision level.
 *
 * This is different from the bounding box of the canvas, because
 * this is effected by the camera's scale (zoom) property.
 *
 * Returns in float form. To round away from the origin to encapsulate
 * the whole of all tiles at least partially visible, further use {@link roundAwayBoundingBox}
 * @param cam - The camera whose screen box bounds the board.
 * @param position The position of the camera.
 * @param scale The scale (zoom) of the camera.
 * @param debugMode - Whether developer mode is enabled.
 * @returns The bounding box
 */
function getBoundingBoxOfBoard(
	cam: Camera,
	position: BDCoords,
	scale: BigDecimal,
	debugMode?: boolean,
): BoundingBoxBD {
	const screenBoundingBox = cam.getScreenBoundingBox(debugMode);

	function getAxisEdges(position: BigDecimal, screenEnd: number): [BigDecimal, BigDecimal] {
		const screenEndBD = bd.fromNumber(screenEnd);
		const distToEdgeInSquares: BigDecimal = bd.divideFloating(screenEndBD, scale);
		const start = bd.subtract(position, distToEdgeInSquares);
		const end = bd.add(position, distToEdgeInSquares);
		return [start, end];
	}

	const [left, right] = getAxisEdges(position[0], screenBoundingBox.right);
	const [bottom, top] = getAxisEdges(position[1], screenBoundingBox.top);

	return { left, right, bottom, top };
}

/**
 * Returns a new board bounding box, with its edges rounded away from the
 * center of the canvas to encapsulate the whole of any squares partially included.
 * STILL IS AN INTEGER BOUNDING BOX,
 * @param src - The source board bounding box
 * @returns The rounded bounding box
 */
function roundAwayBoundingBox(src: BoundingBoxBD): BoundingBox {
	const squareCenter = getSquareCenter();
	const squareCenterMinusOne = bd.subtract(squareCenter, ONE);

	const left = bd.toBigInt(bd.floor(bd.add(src.left, squareCenter))); // floor(left + squareCenter)
	const right = bd.toBigInt(bd.ceil(bd.add(src.right, squareCenterMinusOne))); // ceil(right + squareCenter - 1)
	const bottom = bd.toBigInt(bd.floor(bd.add(src.bottom, squareCenter))); // floor(bottom + squareCenter)
	const top = bd.toBigInt(bd.ceil(bd.add(src.top, squareCenterMinusOne))); // ceil(top + squareCenter - 1)

	return { left, right, bottom, top };
}

// Exports ---------------------------------------------------------------------

export default {
	getSquareCenter,
	getSquareCenterAsNumber,
	getTileWidthPixels,
	getBoundingBoxOfBoard,
	roundAwayBoundingBox,
};
