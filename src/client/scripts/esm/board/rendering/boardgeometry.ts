// src/client/scripts/esm/board/rendering/boardgeometry.ts

/**
 * Board geometry queries: the bounding box of the board currently visible on the
 * canvas, tile widths, and square-center helpers.
 *
 * This is pure geometry derived from the interactive game's camera & board position,
 * used by both game logic (coordinate math) and rendering. It holds a per-frame cached
 * bounding box, recalculated once per game update. The actual drawing of the tiles
 * (its textures & shaders) lives in the per-context {@link boardtiles}.
 */

import type { Camera } from './camera.js';
import type { BDCoords } from '../../../../../shared/chess/util/coordutil.js';
import type { BoundingBox, BoundingBoxBD } from '../../../../../shared/util/math/bounds.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import jsutil from '../../../../../shared/util/jsutil.js';

import camera from './camera.js';
import boardpos from './boardpos.js';

// Constants ---------------------------------------------------------------------------

/** Without this, the center of tiles would be their bottom-left corner. Range: 0-1 */
const squareCenter: number = 0.5;

// BigDecimal constants
const ONE = bd.fromBigInt(1n);

// Variables ---------------------------------------------------------------------------

/**
 * The *exact* bounding box of the board currently visible on the canvas.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 */
let boundingBoxFloat: BoundingBoxBD;
/**
 * The bounding box of the board currently visible on the canvas,
 * rounded away from the center of the canvas to encapsulate the whole of any partially visible squares.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 * CONTAINS INTEGER SQUARE VALUES. No floating points!
 */
let boundingBox: BoundingBox;
/**
 * The bounding box of the board currently visible on the canvas when the CAMERA IS IN DEBUG MODE,
 * rounded away from the center of the canvas to encapsulate the whole of any partially visible squares.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 */
let boundingBox_debugMode: BoundingBox;

// Updating --------------------------------------------------------------------------------

// Recalculate board velicity, scale, and other common variables.
function recalcVariables(): void {
	recalcBoundingBox();
}

function recalcBoundingBox(): void {
	boundingBoxFloat = getBoundingBoxOfBoard(
		boardpos.getBoardPos(),
		boardpos.getBoardScale(),
		false,
	);
	boundingBox = roundAwayBoundingBox(boundingBoxFloat);

	const boundingBoxFloat_debugMode = getBoundingBoxOfBoard(
		boardpos.getBoardPos(),
		boardpos.getBoardScale(),
		true,
	);
	boundingBox_debugMode = roundAwayBoundingBox(boundingBoxFloat_debugMode);
}

// Public API ---------------------------------------------------------------------------------

function getSquareCenter(): BigDecimal {
	return bd.fromNumber(squareCenter);
}

function getSquareCenterAsNumber(): number {
	return squareCenter;
}

/**
 * Returns the width of a tile in virtual pixels at the provided board scale.
 * @param scale - Defaults to the current board scale, but can be overridden.
 * @param cam - The camera to measure against. Defaults to the game camera.
 */
function getTileWidthPixels(
	debugMode = camera.getDebug(),
	scale: BigDecimal = boardpos.getBoardScale(),
	cam: Camera = camera,
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
 * Returns a copy of the board bounding box, rounded away from the center
 * of the canvas to encapsulate the whole of any partially visible squares.
 * CONTAINS INTEGER SQUARE VALUES. No floating points!
 * @returns The board bounding box
 */
function gboundingBox(debugMode = camera.getDebug()): BoundingBox {
	return debugMode
		? jsutil.deepCopyObject(boundingBox_debugMode)
		: jsutil.deepCopyObject(boundingBox);
}

/**
 * Returns a copy of the *exact* board bounding box.
 * @returns The board bounding box
 */
function gboundingBoxFloat(): BoundingBoxBD {
	return jsutil.deepCopyObject(boundingBoxFloat);
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
 * @param [position] The position of the camera.
 * @param [scale] The scale (zoom) of the camera.
 * @param debugMode - Whether developer mode is enabled.
 * @param cam - The camera whose screen box bounds the board. Defaults to the game camera.
 * @returns The bounding box
 */
function getBoundingBoxOfBoard(
	position: BDCoords = boardpos.getBoardPos(),
	scale: BigDecimal = boardpos.getBoardScale(),
	debugMode?: boolean,
	cam: Camera = camera,
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
 * Returns the expected render range bounding box when we're in perspective mode.
 * @param rangeOfView - The distance in tiles (when scale is 1) to render the legal move fields in perspective mode.
 * @returns The perspective mode render range bounding box
 */
function generatePerspectiveBoundingBox(rangeOfView: number): BoundingBoxBD {
	// ~18
	const position = boardpos.getBoardPos();
	const scale = boardpos.getBoardScale();
	const rangeOfViewBD = bd.fromNumber(rangeOfView);
	const renderDistInSquares = bd.divideFloating(rangeOfViewBD, scale);

	return {
		left: bd.subtract(position[0], renderDistInSquares),
		right: bd.add(position[0], renderDistInSquares),
		bottom: bd.subtract(position[1], renderDistInSquares),
		top: bd.add(position[1], renderDistInSquares),
	};
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

// Exports -------------------------------------------------------------------------

export default {
	// Updating
	recalcVariables,
	// Public API
	getSquareCenter,
	getSquareCenterAsNumber,
	getTileWidthPixels,
	gboundingBox,
	gboundingBoxFloat,
	getBoundingBoxOfBoard,
	generatePerspectiveBoundingBox,
	roundAwayBoundingBox,
};
