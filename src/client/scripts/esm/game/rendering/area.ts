
// src/client/scripts/esm/game/rendering/area.js

/**
 * This script handles the calculation of the "Area"s on screen that
 * will contain the desired list of piece coordinates when at a specific
 * camera position and scale (zoom), which can be used to tell
 * {@link transition} where to teleport to.
 */

import transition from './transition.js';
import camera from './camera.js';
import boardtiles from './boardtiles.js';
import math from '../../util/math.js';
import jsutil from '../../util/jsutil.js';
import space from '../misc/space.js';
import guinavigation from '../gui/guinavigation.js';
import guigameinfo from '../gui/guigameinfo.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import boardpos from './boardpos.js';
import bigdecimal, { BigDecimal } from '../../util/bigdecimal/bigdecimal.js';


import type { Board } from '../../chess/logic/gamefile.js';
import type { BoundingBoxBD } from '../../util/math.js';
import type { BDCoords, Coords } from '../../chess/util/coordutil.js';



/**
 * An area object, containing the information {@link transition} needs
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


const ONE = bigdecimal.FromNumber(1.0);
const TWO = bigdecimal.FromNumber(2.0);


const padding: number = 0.03; // As a percentage of the screen WIDTH/HEIGHT (subtract the navigation bars height)
const paddingMiniimage: number = 0.2; // The padding to use when miniimages are visible (zoomed out far)
/**
 * The minimum number of squares that should be visible when transitioning somewhere. 
 * This is so that it doesn't zoom too close-up on a single piece or small group.
 * */
const areaMinHeightSquares: number = 17; // Divided by screen width

// Just the action of adding padding, changes the required scale to have that amount of padding,
// so we need to iterate it a few times for more accuracy.
// MUST BE GREATER THAN 0!
const iterationsToRecalcPadding: number = 10;

/**
 * Calculates the area object that contains every coordinate in the provided list, *with padding added*,
 * and contains the optional {@link existingBox} bounding box.
 * @param coordsList - An array of coordinates, typically of the pieces.
 * @param {BoundingBox} [existingBox] A bounding box to merge with, if specified.
 * @returns {Area | undefined} The area object
 */
function calculateFromCoordsList(coordsList: Coords[], existingBox?: BoundingBoxBD): Area {
	if (coordsList.length === 0) throw Error("Cannot calculate area from an empty coords list.");

	let box: BoundingBoxBD = math.getBoxFromCoordsList(coordsList); // Unpadded
	if (existingBox) box = math.mergeBoundingBoxBDs(box, existingBox); // Unpadded

	return calculateFromUnpaddedBox(box);
}

/**
 * Calulates the area object from the provided bounding box, *with padding added*.
 * @param box - A BoundingBox object.
 * @returns The area object
 */
function calculateFromUnpaddedBox(box: BoundingBoxBD): Area {
	const paddedBox = applyPaddingToBox(box);
	return calculateFromBox(paddedBox);
}

/**
 * Returns a new bounding box, with added padding so the pieces
 * aren't too close to the edge or underneath the navigation bar.
 * @param box - The source bounding box
 * @returns The new bounding box
 */
function applyPaddingToBox(box: BoundingBoxBD): BoundingBoxBD { // { left, right, bottom, top }

	const boxCopy: BoundingBoxBD = jsutil.deepCopyObject(box);

	const topNavHeight = guinavigation.getHeightOfNavBar();
	const bottomNavHeight = guigameinfo.getHeightOfGameInfoBar();
	const navHeight = topNavHeight + bottomNavHeight;
	const canvasHeightVirtualSubNav = camera.getCanvasHeightVirtualPixels() - navHeight;

	const squareCenter = boardtiles.gsquareCenter();
	const squareCenterInvertedBD = bigdecimal.subtract(ONE, squareCenter);

	// Round to the furthest away edge of the square.
	boxCopy.left = bigdecimal.subtract(boxCopy.left, squareCenter);
	boxCopy.right = bigdecimal.add(boxCopy.right, squareCenterInvertedBD);
	boxCopy.bottom = bigdecimal.subtract(boxCopy.bottom, squareCenter);
	boxCopy.top = bigdecimal.add(boxCopy.top, squareCenterInvertedBD);

	/** Start with a copy with zero padding. */
	let paddedBox: BoundingBoxBD = jsutil.deepCopyObject(boxCopy);
	let scaleBD: BigDecimal = calcScaleToMatchSides(paddedBox);

	// Iterate until we have desired padding
	for (let i = 0; i < iterationsToRecalcPadding; i++) {
		const paddingToUse: number = bigdecimal.compare(scaleBD, camera.getScaleWhenZoomedOut()) < 0 ? paddingMiniimage : padding;
		const paddingHorzPixels = camera.getCanvasWidthVirtualPixels() * paddingToUse;
		const paddingVertPixels = canvasHeightVirtualSubNav * paddingToUse + bottomNavHeight;

		const paddingHorzWorldBD = bigdecimal.FromNumber(space.convertPixelsToWorldSpace_Virtual(paddingHorzPixels));
		const paddingVertWorldBD = bigdecimal.FromNumber(space.convertPixelsToWorldSpace_Virtual(paddingVertPixels));
		const paddingHorz: BigDecimal = bigdecimal.divide_fixed(paddingHorzWorldBD, scaleBD);
		const paddingVert: BigDecimal = bigdecimal.divide_fixed(paddingVertWorldBD, scaleBD);

		paddedBox = addPaddingToBoundingBox(boxCopy, paddingHorz, paddingVert);

		// Prep for next iteration
		scaleBD = calcScaleToMatchSides(paddedBox);
	}

	return paddedBox;
}

/**
 * Calculates an Area object from the given bounding box.
 * The box must come PRE-PADDED.
 * @param box - The bounding box
 * @returns The area object
 */
function calculateFromBox(box: BoundingBoxBD): Area { // { left, right, bottom, top }
	// The new boardPos is the middle point
	const newBoardPos = math.calcCenterOfBoundingBox(box);


	// What is the scale required to match the sides?
	const newScale = calcScaleToMatchSides(box);

	// Now maximize the bounding box to fill entire screen when at position and scale, so that
	// we don't have long thin slices of a bounding box that will fail the math.boxContainsSquare() function EVEN
	// if the square is visible on screen!
	const maximizedBox = boardtiles.getBoundingBoxOfBoard(newBoardPos, newScale, false);
	math;
	// PROBLEM WITH this enabled is since it changes the size of the boundingBox, new coords are not centered.

	return {
		coords: newBoardPos,
		scale: newScale,
		boundingBox: maximizedBox
	};
}

function getBoundingBoxHalfDimensions(boundingBox: BoundingBoxBD): { xHalfLength: BigDecimal, yHalfLength: BigDecimal } {
	const xDiff = bigdecimal.subtract(boundingBox.right, boundingBox.left);
	const yDiff = bigdecimal.subtract(boundingBox.top, boundingBox.bottom);
	return {
		xHalfLength: bigdecimal.divide_fixed(xDiff, TWO),
		yHalfLength: bigdecimal.divide_fixed(yDiff, TWO)
	}
}

/**
 * Calculates the camera scale (zoom) needed to fit
 * the provided board bounding box within the canvas.
 * @param boundingBox - The bounding box
 * @returns The scale (zoom) required
 */
function calcScaleToMatchSides(boundingBox: BoundingBoxBD): BigDecimal {
	const { xHalfLength, yHalfLength } = getBoundingBoxHalfDimensions(boundingBox);

	const screenBoundingBox = camera.getScreenBoundingBox(false); // Get the screen bounding box without the navigation bars
	const screenBoundingBoxBD: BoundingBoxBD = math.castDoubleBoundingBoxToBigDecimal(screenBoundingBox);

	// What is the scale required to match the sides?
	const xScale = bigdecimal.divide_floating(screenBoundingBoxBD.right, xHalfLength);
	const yScale = bigdecimal.divide_floating(screenBoundingBoxBD.top, yHalfLength);
	const screenHeight = screenBoundingBox.top - screenBoundingBox.bottom;
	// Can afterward cast to BigDecimal since they are small numbers.
	const capScale = bigdecimal.FromNumber(screenHeight / areaMinHeightSquares);

	let newScale = bigdecimal.min(xScale, yScale);
	newScale = bigdecimal.min(newScale, capScale);

	return newScale;
}

/**
 * Creates a new bounding box with the added padding.
 * @param boundingBox The bounding box
 * @param horzPad - Horizontal padding
 * @param vertPad - Vertical padding
 * @returns The padded bounding box
 */
function addPaddingToBoundingBox(boundingBox: BoundingBoxBD, horzPad: BigDecimal, vertPad: BigDecimal): BoundingBoxBD {
	return {
		left: bigdecimal.subtract(boundingBox.left, horzPad),
		right: bigdecimal.add(boundingBox.right, horzPad),
		bottom: bigdecimal.subtract(boundingBox.bottom, vertPad),
		top: bigdecimal.add(boundingBox.top, vertPad),
	};
}

function initTelFromCoordsList(coordsList: Coords[]): void {
	if (coordsList.length === 0) throw Error("Cannot init teleport from an empty coords list.");

	const box = math.getBoxFromCoordsList(coordsList); // Unpadded
	initTelFromUnpaddedBox(box);
}

function initTelFromUnpaddedBox(box: BoundingBoxBD): void {
	const thisArea = calculateFromUnpaddedBox(box);
	initTelFromArea(thisArea);
}

/**
 * Tells {@link transition} where to teleport to based off the provided area object.
 * @param thisArea - The area object to teleport to
 * @param [ignoreHistory] Whether to forget adding this teleport to the teleport history.
 */
function initTelFromArea(thisArea: Area, ignoreHistory?: boolean): void {
	const thisAreaBox = thisArea.boundingBox;

	const startCoords = boardpos.getBoardPos();
	const endCoords = thisArea.coords;

	const currentBoardBoundingBox = boardtiles.gboundingBox(); // Tile/board space, NOT world-space

	// Will a teleport to this area be a zoom out or in?
	const isAZoomOut = thisArea.scale < boardpos.getBoardScale();

	let firstArea: Area | undefined;

	if (isAZoomOut) { // If our current screen isn't within the final area, create new area to teleport to first
		if (!math.boxContainsSquare(thisAreaBox, startCoords)) {
			math.expandBDBoxToContainSquare(thisAreaBox, startCoords); // Unpadded
			firstArea = calculateFromUnpaddedBox(thisAreaBox);
		}
		// Version that fits the entire screen on the zoom out
		// if (!math.boxContainsBox(thisAreaBox, currentBoardBoundingBox)) {
		//     const mergedBoxes = math.mergeBoundingBoxBDs(currentBoardBoundingBox, thisAreaBox);
		//     firstArea = calculateFromBox(mergedBoxes);
		// }
	} else { // zoom-in. If the end area isn't visible on screen now, create new area to teleport to first
		if (!math.boxContainsSquare(currentBoardBoundingBox, endCoords)) {
			math.expandBDBoxToContainSquare(thisAreaBox, endCoords); // Unpadded
			firstArea = calculateFromUnpaddedBox(thisAreaBox);
		}
		// Version that fits the entire screen on the zoom out
		// if (!math.boxContainsBox(currentBoardBoundingBox, thisAreaBox)) {
		//     const mergedBoxes = math.mergeBoundingBoxBDs(currentBoardBoundingBox, thisAreaBox);
		//     firstArea = calculateFromBox(mergedBoxes);
		// }
	}

	const tel1 = firstArea ? { endCoords: firstArea.coords, endScale: firstArea.scale } : undefined;
	const tel2 = { endCoords: thisArea.coords, endScale: thisArea.scale };

	if (tel1) transition.teleport(tel1, tel2, ignoreHistory);
	else transition.teleport(tel2, null, ignoreHistory);
}

/**
 * Returns the area object that contains all pieces within
 * it from the specified gamefile, with added padding.
 * @param board - The gamefile
 * @returns The area object
 */
function getAreaOfAllPieces(board: Board): Area {
	return calculateFromUnpaddedBox(gamefileutility.getStartingAreaBox(board));
}

export default {
	calculateFromCoordsList,
	calculateFromUnpaddedBox,
	getAreaOfAllPieces,
	initTelFromUnpaddedBox,
	initTelFromCoordsList,
	initTelFromArea
};