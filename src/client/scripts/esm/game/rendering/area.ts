
// src/client/scripts/esm/game/rendering/area.js

/**
 * This script handles the calculation of the "Area"s on screen that
 * will contain the desired list of piece coordinates when at a specific
 * camera position and scale (zoom), which can be used to tell
 * {@link transition} where to teleport to.
 */

import camera from './camera.js';
import boardtiles from './boardtiles.js';
import math from '../../../../../shared/util/math/math.js';
import jsutil from '../../../../../shared/util/jsutil.js';
import guinavigation from '../gui/guinavigation.js';
import guigameinfo from '../gui/guigameinfo.js';
import boardpos from './boardpos.js';
import meshes from './meshes.js';
import space from '../misc/space.js';
import transition, { ZoomTransition } from './transition.js';
import bigdecimal, { BigDecimal } from '../../../../../shared/util/bigdecimal/bigdecimal.js';
import bounds, { BoundingBoxBD } from '../../../../../shared/util/math/bounds.js';


import type { BDCoords, Coords } from '../../../../../shared/chess/util/coordutil.js';



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


const TWO = bigdecimal.FromNumber(2.0);


const padding: number = 0.03; // As a percentage of the screen WIDTH/HEIGHT (subtract the navigation bars height)
const paddingMiniimage: number = 0.2; // The padding to use when miniimages are visible (zoomed out far)
/**
 * The minimum number of squares that should be visible when transitioning somewhere. 
 * This is so that it doesn't zoom too close-up on a single piece or small group.
 */
const areaMinHeightSquares: number = 17; // Divided by screen width

// Just the action of adding padding, changes the required scale to have that amount of padding,
// so we need to iterate it a few times for more accuracy.
// MUST BE GREATER THAN 0!
const iterationsToRecalcPadding: number = 10;

/**
 * Returns a new bounding box, with added padding so the pieces
 * aren't too close to the edge or underneath the navigation bar.
 * @param box - The source bounding box, floating point edges.
 * @returns The new bounding box
 */
function applyPaddingToBox(box: BoundingBoxBD): BoundingBoxBD { // { left, right, bottom, top }

	const boxCopy: BoundingBoxBD = jsutil.deepCopyObject(box);

	const topNavHeight = guinavigation.getHeightOfNavBar();
	const bottomNavHeight = guigameinfo.getHeightOfGameInfoBar();
	const navHeight = topNavHeight + bottomNavHeight;
	const canvasHeightVirtualSubNav = camera.getCanvasHeightVirtualPixels() - navHeight;

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

		paddedBox = {
			left: bigdecimal.subtract(boxCopy.left, paddingHorz),
			right: bigdecimal.add(boxCopy.right, paddingHorz),
			bottom: bigdecimal.subtract(boxCopy.bottom, paddingVert),
			top: bigdecimal.add(boxCopy.top, paddingVert),
		};

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
	const newBoardPos = bounds.calcCenterOfBoundingBox(box);


	// What is the scale required to match the sides?
	const newScale = calcScaleToMatchSides(box);

	// Now maximize the bounding box to fill entire screen when at position and scale, so that
	// we don't have long thin slices of a bounding box that will fail the bounds.boxContainsSquare() function EVEN
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
	};
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
	const screenBoundingBoxBD: BoundingBoxBD = bounds.castDoubleBoundingBoxToBigDecimal(screenBoundingBox);

	// What is the scale required to match the sides?
	const xScale = bigdecimal.divide_floating(screenBoundingBoxBD.right, xHalfLength);
	const yScale = bigdecimal.divide_floating(screenBoundingBoxBD.top, yHalfLength);
	const screenHeight = screenBoundingBox.top - screenBoundingBox.bottom;
	// Can afterward cast to BigDecimal since they are small numbers.
	const capScale = bigdecimal.FromNumber(screenHeight / areaMinHeightSquares);

	let newScale = bigdecimal.min(xScale, yScale);
	newScale = bigdecimal.min(newScale, capScale); // Cap the scale to not zoom in too close for comfort

	return newScale;
}

/**
 * Calculates the area object that contains every coordinate in the provided list, *with padding added*,
 * and contains the optional {@link existingBox} bounding box.
 * @param coordsList - An array of coordinates, typically of the pieces.
 * @returns The area object
 */
function calculateFromCoordsList(coordsList: Coords[]): Area {
	if (coordsList.length === 0) throw Error("Cannot calculate area from an empty coords list.");

	const box = bounds.getBoxFromCoordsList(coordsList); // Unpadded
	const boxFloating = meshes.expandTileBoundingBoxToEncompassWholeSquare(box);

	return calculateFromUnpaddedBox(boxFloating);
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
 * High level function that initaties one or two zoom transitions
 * with the goal of getting the target Area on screen.
 * @param thisArea - The Area object to get on screen.
 * @param [ignoreHistory] Whether to skip adding this teleport to the teleport history.
 */
function initTransitionFromArea(thisArea: Area, ignoreHistory: boolean): void {
	const thisAreaBox = thisArea.boundingBox;

	const startCoords = boardpos.getBoardPos();
	const endCoords = thisArea.coords;

	const currentBoardBoundingBox = boardtiles.gboundingBoxFloat(); // Tile/board space, NOT world-space

	// Will a teleport to this area be a zoom out or in?
	const isAZoomOut = bigdecimal.compare(thisArea.scale, boardpos.getBoardScale()) < 0;

	let firstArea: Area | undefined;

	if (isAZoomOut) { // If our current screen isn't within the final area, create new area to teleport to first
		if (!bounds.boxContainsSquareBD(thisAreaBox, startCoords)) {
			bounds.expandBDBoxToContainSquare(thisAreaBox, startCoords); // Unpadded
			firstArea = calculateFromUnpaddedBox(thisAreaBox);
		}
		// Version that fits the entire screen on the zoom out
		// if (!bounds.boxContainsBoxBD(thisAreaBox, currentBoardBoundingBox)) {
		//     const mergedBoxes = bounds.mergeBoundingBoxBDs(currentBoardBoundingBox, thisAreaBox);
		//     firstArea = calculateFromBox(mergedBoxes);
		// }
	} else { // zoom-in. If the end area isn't visible on screen now, create new area to teleport to first
		if (!bounds.boxContainsSquareBD(currentBoardBoundingBox, endCoords)) {
			bounds.expandBDBoxToContainSquare(currentBoardBoundingBox, endCoords); // Unpadded
			firstArea = calculateFromUnpaddedBox(currentBoardBoundingBox);
		}
		// Version that fits the entire screen on the zoom out
		// if (!bounds.boxContainsBoxBD(currentBoardBoundingBox, thisAreaBox)) {
		//     const mergedBoxes = bounds.mergeBoundingBoxBDs(currentBoardBoundingBox, thisAreaBox);
		//     firstArea = calculateFromBox(mergedBoxes);
		// }
	}

	const trans1: ZoomTransition | undefined = firstArea ? { destinationCoords: firstArea.coords, destinationScale: firstArea.scale } : undefined;
	const trans2: ZoomTransition = { destinationCoords: thisArea.coords, destinationScale: thisArea.scale };

	if (trans1) transition.zoomTransition(trans1, trans2, ignoreHistory);
	else transition.zoomTransition(trans2, undefined, ignoreHistory);
}

export default {
	calculateFromCoordsList,
	calculateFromUnpaddedBox,
	initTransitionFromArea,
};