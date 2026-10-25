// src/client/scripts/game/rendering/boardview.ts

/**
 * The region of the board the interactive game's camera currently sees, as bounding boxes
 * cached once per game update, plus the render range used in perspective mode.
 */

import type { BoundingBox, BoundingBoxBD } from '../../../../shared/util/math/bounds.js';

import bd from '@naviary/bigdecimal';

import jsutil from '../../../../shared/util/jsutil.js';

import camera from '../../board/rendering/camera.js';
import boardpos from '../../board/rendering/boardpos.js';
import boardgeometry from '../../board/rendering/boardgeometry.js';

// State -----------------------------------------------------------------------

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

// Updating --------------------------------------------------------------------

/** Recalculates all three cached bounding boxes of the board. */
function recalcVariables(): void {
	const position = boardpos.getBoardPos();
	const scale = boardpos.getBoardScale();

	boundingBoxFloat = boardgeometry.getBoundingBoxOfBoard(camera, position, scale, false);
	boundingBox = boardgeometry.roundAwayBoundingBox(boundingBoxFloat);

	const boundingBoxFloat_debugMode = boardgeometry.getBoundingBoxOfBoard(camera, position, scale, true); // prettier-ignore
	boundingBox_debugMode = boardgeometry.roundAwayBoundingBox(boundingBoxFloat_debugMode);
}

// Getters ---------------------------------------------------------------------

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
 * Returns the expected render range bounding box when we're in perspective mode.
 * @param rangeOfView - The distance in tiles (when scale is 1) to render the legal move fields in perspective mode.
 * @returns The perspective mode render range bounding box
 */
function generatePerspectiveBoundingBox(rangeOfView: number): BoundingBoxBD {
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

// Exports ---------------------------------------------------------------------

export default {
	// Updating
	recalcVariables,
	// Getters
	gboundingBox,
	gboundingBoxFloat,
	generatePerspectiveBoundingBox,
};
