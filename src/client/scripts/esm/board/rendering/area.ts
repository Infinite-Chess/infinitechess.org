// src/client/scripts/esm/board/rendering/area.ts

/**
 * Calculates "Area"s: the camera position and scale (zoom) that
 * frame a given region of the board on screen, with padding.
 */

import type { Camera } from './camera.js';
import type { BDCoords, Coords } from '../../../../../shared/util/coordutil.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import bounds, { BoundingBoxBD } from '../../../../../shared/util/math/bounds.js';

import space from './space.js';
import camera from './camera.js';
import meshes from './meshes.js';
import boardgeometry from './boardgeometry.js';

// Types -----------------------------------------------------------------------

/** A camera position and scale framing a region of the board. */
export interface Area {
	/** The coordinates of the area. */
	coords: BDCoords;
	/** The camera scale (zoom) of the area. */
	scale: BigDecimal;
	/** The bounding box that contains the area of interest. */
	boundingBox: BoundingBoxBD;
}

// Constants -------------------------------------------------------------------

const TWO = bd.fromNumber(2.0);

/**
 * Minimum padding between a zoomed-in area's squares and the edge
 * of the screen, as a percentage of the screen WIDTH/HEIGHT.
 */
const PADDING: number = 0.04;
/** Minimum gap between a zoomed-out area's mini images and the screen edge, in virtual pixels. */
const MINIIMAGE_GAP_VPIXELS: number = 5;
/**
 * When zoomed out, mini images are constrained within this fixed-size virtual pixel
 * region in the center of the screen, canvas-size-independent.
 */
const MINIIMAGE_CONTENT_SIZE_VPIXELS: number = 640;

/** The maximum width (in virtual pixels) that a single square should take up on screen for an area. */
const AREA_MAX_SQUARE_VPIXELS: BigDecimal = bd.fromNumber(70);
/**
 * The minimum number of squares that should be visible when transitioning somewhere.
 * Prevents variant preview tooltips from being too zoomed in.
 */
const AREA_MIN_HEIGHT_SQUARES: number = 10;

/**
 * Just the action of adding padding, changes the required scale to have that
 * amount of padding, so we need to iterate it a few times for more accuracy.
 * MUST BE GREATER THAN 0!
 */
const PADDING_RECALC_ITERATIONS: number = 10;

// Padding ---------------------------------------------------------------------

/**
 * Returns a new bounding box, with added padding so the pieces aren't too close to the edge.
 * @param box - The source bounding box, floating point edges.
 * @param entityWidthVPixels - The on-screen size of each mini image, in virtual pixels.
 * @param cam - The camera to fit the box within. Defaults to the game camera.
 * @returns The new bounding box
 */
function applyPaddingToBox(
	box: BoundingBoxBD,
	entityWidthVPixels: number,
	cam: Camera = camera,
): BoundingBoxBD {
	const canvasWidth = cam.getCanvasWidthVirtualPixels();
	const canvasHeight = cam.getCanvasHeightVirtualPixels();

	let paddedBox: BoundingBoxBD = box;
	let scaleBD: BigDecimal = calcScaleToMatchSides(paddedBox, cam);

	// Iterate until we have desired padding
	for (let i = 0; i < PADDING_RECALC_ITERATIONS; i++) {
		const zoomedOut = bd.compare(scaleBD, cam.getScaleWhenZoomedOut()) < 0;
		const paddingHorzPixels = calcPaddingPixels(canvasWidth, zoomedOut, entityWidthVPixels);
		const paddingVertPixels = calcPaddingPixels(canvasHeight, zoomedOut, entityWidthVPixels);

		const paddingHorzWorldBD = bd.fromNumber(
			space.convertPixelsToWorldSpace_Virtual(paddingHorzPixels, cam),
		);
		const paddingVertWorldBD = bd.fromNumber(
			space.convertPixelsToWorldSpace_Virtual(paddingVertPixels, cam),
		);
		const paddingHorz: BigDecimal = bd.divide(paddingHorzWorldBD, scaleBD);
		const paddingVert: BigDecimal = bd.divide(paddingVertWorldBD, scaleBD);

		paddedBox = {
			left: bd.subtract(box.left, paddingHorz),
			right: bd.add(box.right, paddingHorz),
			bottom: bd.subtract(box.bottom, paddingVert),
			top: bd.add(box.top, paddingVert),
		};

		// Prep for next iteration
		scaleBD = calcScaleToMatchSides(paddedBox, cam);
	}

	return paddedBox;
}

/**
 * Padding along one canvas dimension, in virtual pixels. Zoomed out, it's measured from
 * the mini images' edges, which overhang their squares by half their width.
 */
function calcPaddingPixels(
	canvasLength: number,
	zoomedOut: boolean,
	entityWidthVPixels: number,
): number {
	if (!zoomedOut) return canvasLength * PADDING;
	const regionPadding = (canvasLength - MINIIMAGE_CONTENT_SIZE_VPIXELS) / 2;
	return entityWidthVPixels / 2 + Math.max(MINIIMAGE_GAP_VPIXELS, regionPadding);
}

// Area Calculation ------------------------------------------------------------

/**
 * Calculates an Area object from the given bounding box.
 * The box must come PRE-PADDED.
 * @param box - The bounding box
 * @returns The area object
 */
function calculateFromBox(box: BoundingBoxBD, cam: Camera = camera): Area {
	// The new boardPos is the middle point
	const newBoardPos = bounds.calcCenterOfBoundingBox(box);

	// What is the scale required to match the sides?
	const newScale = calcScaleToMatchSides(box, cam);

	// Now maximize the bounding box to fill entire screen when at position and scale, so that
	// we don't have long thin slices of a bounding box that will fail the bounds.boxContainsSquare() function EVEN
	// if the square is visible on screen!
	const maximizedBox = boardgeometry.getBoundingBoxOfBoard(newBoardPos, newScale, false, cam);

	return {
		coords: newBoardPos,
		scale: newScale,
		boundingBox: maximizedBox,
	};
}

/** Returns half the width and height of the bounding box. */
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

	const screenBoundingBox = cam.getScreenBoundingBox(false); // Debug mode's zoomed-out view ignored
	const screenBoundingBoxBD: BoundingBoxBD =
		bounds.castDoubleBoundingBoxToBigDecimal(screenBoundingBox);

	// What is the scale required to match the sides?
	const xScale = bd.divideFloating(screenBoundingBoxBD.right, xHalfLength);
	const yScale = bd.divideFloating(screenBoundingBoxBD.top, yHalfLength);
	const screenHeight = screenBoundingBox.top - screenBoundingBox.bottom;
	// Can afterward cast to BigDecimal since they are small numbers.

	let newScale = bd.min(xScale, yScale);

	// Cap the scale to AREA_MIN_HEIGHT_SQUARES
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
 * Calculates the area object that contains every coordinate in the provided list, *with padding added*.
 * @param coordsList - An array of coordinates, typically of the pieces.
 * @param entityWidthVPixels - The on-screen size of each mini image, in virtual pixels.
 * @param cam - The camera to fit the area within. Defaults to the game camera.
 * @returns The area object
 */
function calculateFromCoordsList(
	coordsList: Coords[],
	entityWidthVPixels: number,
	cam: Camera = camera,
): Area {
	if (coordsList.length === 0) throw Error('Cannot calculate area from an empty coords list.');

	const box = bounds.getBoxFromCoordsList(coordsList); // Unpadded
	const boxFloating = meshes.expandTileBoundingBoxToEncompassWholeSquare(box);

	return calculateFromUnpaddedBox(boxFloating, entityWidthVPixels, cam);
}

/**
 * Calculates the area object from the provided bounding box, *with padding added*.
 * @param box - A BoundingBox object.
 * @param entityWidthVPixels - The on-screen size of each mini image, in virtual pixels.
 * @param cam - The camera to fit the area within. Defaults to the game camera.
 * @returns The area object
 */
function calculateFromUnpaddedBox(
	box: BoundingBoxBD,
	entityWidthVPixels: number,
	cam: Camera = camera,
): Area {
	const paddedBox = applyPaddingToBox(box, entityWidthVPixels, cam);
	return calculateFromBox(paddedBox, cam);
}

// Exports ---------------------------------------------------------------------

export default {
	calculateFromCoordsList,
	calculateFromUnpaddedBox,
};
