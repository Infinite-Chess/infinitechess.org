// src/client/scripts/esm/board/rendering/area.ts

/**
 * This script handles the calculation of the "Area"s on screen that
 * will contain the desired list of piece coordinates when at a specific
 * camera position and scale (zoom), which can be used to tell
 * {@link Transition} where to teleport to.
 */

import type { Camera } from './camera.js';
import type { BDCoords, Coords } from '../../../../../shared/util/coordutil.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import jsutil from '../../../../../shared/util/jsutil.js';
import bounds, { BoundingBoxBD } from '../../../../../shared/util/math/bounds.js';

import space from './space.js';
import camera from './camera.js';
import meshes from './meshes.js';
import boardgeometry from './boardgeometry.js';

/**
 * An area object, containing the information {@link Transition} needs
 * to teleport/transition to this location on the board.
 */
export interface Area {
	/** The coordinates of the area. */
	coords: BDCoords;
	/** The camera scale (zoom) of the area. */
	scale: BigDecimal;
	/** The bounding box that contains the area of interest. */
	boundingBox: BoundingBoxBD;
}

const TWO = bd.fromNumber(2.0);

/**
 * Minimum padding between an area's pieces and the edge of
 * the screen, as a percentage of the screen WIDTH/HEIGHT.
 */
const padding: number = 0.04;
/**
 * When we're zoomed out (mini images visible), content is constrained within this
 * fixed-size virtual pixel region in the center of the screen, canvas-size-independent.
 * Falls back to standard {@link padding} when the canvas is smaller than this size.
 */
const MINIIMAGE_CONTENT_SIZE_VPIXELS: number = 600;

/** The maximum width (in virtual pixels) that a single square should take up on screen for an area. */
const AREA_MAX_SQUARE_VPIXELS: BigDecimal = bd.fromNumber(70);
/**
 * The minimum number of squares that should be visible when transitioning somewhere.
 * Prevents variant preview tooltips from being too zoomed in.
 */
const AREA_MIN_HEIGHT_SQUARES: number = 10; // Divided by screen width

/**
 * Just the action of adding padding, changes the required scale to have that
 * amount of padding, so we need to iterate it a few times for more accuracy.
 * MUST BE GREATER THAN 0!
 */
const iterationsToRecalcPadding: number = 10;

/**
 * Returns a new bounding box, with added padding so the pieces
 * aren't too close to the edge or underneath the navigation bar.
 * @param box - The source bounding box, floating point edges.
 * @param cam - The camera to fit the box within. Defaults to the game camera.
 * @returns The new bounding box
 */
function applyPaddingToBox(box: BoundingBoxBD, cam: Camera = camera): BoundingBoxBD {
	// { left, right, bottom, top }

	const boxCopy: BoundingBoxBD = jsutil.deepCopyObject(box);

	const canvasWidth = cam.getCanvasWidthVirtualPixels();
	const canvasHeight = cam.getCanvasHeightVirtualPixels();

	/** Start with a copy with zero padding. */
	let paddedBox: BoundingBoxBD = jsutil.deepCopyObject(boxCopy);
	let scaleBD: BigDecimal = calcScaleToMatchSides(paddedBox, cam);

	// Iterate until we have desired padding
	for (let i = 0; i < iterationsToRecalcPadding; i++) {
		// Zoomed-in area: use standard padding, which is a percentage of the canvas size.
		let paddingHorzPixels: number = canvasWidth * padding;
		let paddingVertPixels: number = canvasHeight * padding;

		if (bd.compare(scaleBD, cam.getScaleWhenZoomedOut()) < 0) {
			// Zoomed-out area: constrain content to a fixed-size pixel region regardless of canvas
			// size. Falls back to standard padding when the canvas is smaller than that region.
			paddingHorzPixels = Math.max(
				paddingHorzPixels,
				(canvasWidth - MINIIMAGE_CONTENT_SIZE_VPIXELS) / 2,
			);
			paddingVertPixels = Math.max(
				paddingVertPixels,
				(canvasHeight - MINIIMAGE_CONTENT_SIZE_VPIXELS) / 2,
			);
		}

		const paddingHorzWorldBD = bd.fromNumber(
			space.convertPixelsToWorldSpace_Virtual(paddingHorzPixels, cam),
		);
		const paddingVertWorldBD = bd.fromNumber(
			space.convertPixelsToWorldSpace_Virtual(paddingVertPixels, cam),
		);
		const paddingHorz: BigDecimal = bd.divide(paddingHorzWorldBD, scaleBD);
		const paddingVert: BigDecimal = bd.divide(paddingVertWorldBD, scaleBD);

		paddedBox = {
			left: bd.subtract(boxCopy.left, paddingHorz),
			right: bd.add(boxCopy.right, paddingHorz),
			bottom: bd.subtract(boxCopy.bottom, paddingVert),
			top: bd.add(boxCopy.top, paddingVert),
		};

		// Prep for next iteration
		scaleBD = calcScaleToMatchSides(paddedBox, cam);
	}

	return paddedBox;
}

/**
 * Calculates an Area object from the given bounding box.
 * The box must come PRE-PADDED.
 * @param box - The bounding box
 * @returns The area object
 */
function calculateFromBox(box: BoundingBoxBD, cam: Camera = camera): Area {
	// { left, right, bottom, top }
	// The new boardPos is the middle point
	const newBoardPos = bounds.calcCenterOfBoundingBox(box);

	// What is the scale required to match the sides?
	const newScale = calcScaleToMatchSides(box, cam);

	// Now maximize the bounding box to fill entire screen when at position and scale, so that
	// we don't have long thin slices of a bounding box that will fail the bounds.boxContainsSquare() function EVEN
	// if the square is visible on screen!
	const maximizedBox = boardgeometry.getBoundingBoxOfBoard(newBoardPos, newScale, false, cam);
	// PROBLEM WITH this enabled is since it changes the size of the boundingBox, new coords are not centered.

	return {
		coords: newBoardPos,
		scale: newScale,
		boundingBox: maximizedBox,
	};
}

function getBoundingBoxHalfDimensions(boundingBox: BoundingBoxBD): {
	xHalfLength: BigDecimal;
	yHalfLength: BigDecimal;
} {
	const xDiff = bd.subtract(boundingBox.right, boundingBox.left);
	const yDiff = bd.subtract(boundingBox.top, boundingBox.bottom);
	return {
		xHalfLength: bd.divide(xDiff, TWO),
		yHalfLength: bd.divide(yDiff, TWO),
	};
}

/**
 * Calculates the camera scale (zoom) needed to fit
 * the provided board bounding box within the canvas.
 * @param boundingBox - The bounding box
 * @returns The scale (zoom) required
 */
function calcScaleToMatchSides(boundingBox: BoundingBoxBD, cam: Camera = camera): BigDecimal {
	const { xHalfLength, yHalfLength } = getBoundingBoxHalfDimensions(boundingBox);

	const screenBoundingBox = cam.getScreenBoundingBox(false); // Get the screen bounding box without the navigation bars
	const screenBoundingBoxBD: BoundingBoxBD =
		bounds.castDoubleBoundingBoxToBigDecimal(screenBoundingBox);

	// What is the scale required to match the sides?
	const xScale = bd.divideFloating(screenBoundingBoxBD.right, xHalfLength);
	const yScale = bd.divideFloating(screenBoundingBoxBD.top, yHalfLength);
	const screenHeight = screenBoundingBox.top - screenBoundingBox.bottom;
	// Can afterward cast to BigDecimal since they are small numbers.

	let newScale = bd.min(xScale, yScale);

	// Cap the scale to areaMinHeightSquares
	const capScale = bd.fromNumber(screenHeight / AREA_MIN_HEIGHT_SQUARES);
	newScale = bd.min(newScale, capScale);

	// Also cap the scale if squares would be too large visibly on screen
	const tileWidthPixels = boardgeometry.getTileWidthPixels(false, newScale, cam);
	if (bd.compare(tileWidthPixels, AREA_MAX_SQUARE_VPIXELS) > 0) {
		const scaleFactor = bd.divideFloating(AREA_MAX_SQUARE_VPIXELS, tileWidthPixels);
		newScale = bd.multiplyFloating(newScale, scaleFactor);
	}

	return newScale;
}

/**
 * Calculates the area object that contains every coordinate in the provided list, *with padding added*,
 * and contains the optional {@link existingBox} bounding box.
 * @param coordsList - An array of coordinates, typically of the pieces.
 * @param cam - The camera to fit the area within. Defaults to the game camera.
 * @returns The area object
 */
function calculateFromCoordsList(coordsList: Coords[], cam: Camera = camera): Area {
	if (coordsList.length === 0) throw Error('Cannot calculate area from an empty coords list.');

	const box = bounds.getBoxFromCoordsList(coordsList); // Unpadded
	const boxFloating = meshes.expandTileBoundingBoxToEncompassWholeSquare(box);

	return calculateFromUnpaddedBox(boxFloating, cam);
}

/**
 * Calulates the area object from the provided bounding box, *with padding added*.
 * @param box - A BoundingBox object.
 * @param cam - The camera to fit the area within. Defaults to the game camera.
 * @returns The area object
 */
function calculateFromUnpaddedBox(box: BoundingBoxBD, cam: Camera = camera): Area {
	const paddedBox = applyPaddingToBox(box, cam);
	return calculateFromBox(paddedBox, cam);
}

export default {
	calculateFromCoordsList,
	calculateFromUnpaddedBox,
};
