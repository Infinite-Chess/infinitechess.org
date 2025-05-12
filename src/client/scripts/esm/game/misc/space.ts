
/**
 * This script converts world-space coordinates to square coordinates, and vice verca.
 * 
 * Where square coordinates are where the pieces are located,
 * world-space coordinates are where in space objects are actually rendered.
 * 
 * There is also pixel space, which is the [x,y] coordinate of virtual pixels on the screen.
 * 
 * Grid space: 1 unit = width of 1 square
 */


import type { Coords } from '../../chess/util/coordutil.js';


import boardpos from '../rendering/boardpos.js';
// @ts-ignore
import board from "../rendering/board.js";
// @ts-ignore
import camera from "../rendering/camera.js";
// @ts-ignore
import perspective from '../rendering/perspective.js';


/**
 * Since the camera is fixed in place, with the board moving and scaling below it,
 * this depends on your position and scale.
 */
function convertWorldSpaceToCoords(worldCoords: Coords): Coords {
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScale();
	return [
		worldCoords[0] / boardScale + boardPos[0],
		worldCoords[1] / boardScale + boardPos[1]
	];
}

/** Returns the integer square coordinate that includes the floating point square coords inside its area. */
function convertWorldSpaceToCoords_Rounded(worldCoords: Coords): Coords {
	const coords = convertWorldSpaceToCoords(worldCoords);
	const squareCenter = board.gsquareCenter();
	return [
		Math.floor(coords[0] + squareCenter),
		Math.floor(coords[1] + squareCenter)
	];
}

// Takes a square coordinate, returns the world-space location of the square's VISUAL center! Dependant on board.gsquareCenter().
function convertCoordToWorldSpace(coords: Coords, position: Coords = boardpos.getBoardPos(), scale: number = boardpos.getBoardScale()): Coords {
	const squareCenter = board.gsquareCenter();
	return [
		(coords[0] - position[0] + 0.5 - squareCenter) * scale,
		(coords[1] - position[1] + 0.5 - squareCenter) * scale
	];
}

function convertCoordToWorldSpace_IgnoreSquareCenter(coords: Coords, position = boardpos.getBoardPos(), scale = boardpos.getBoardScale()): Coords {
	return [
		(coords[0] - position[0]) * scale,
		(coords[1] - position[1]) * scale
	];
}

function convertPixelsToWorldSpace_Virtual(value: number): number {
	const screenHeight = camera.getScreenHeightWorld(false);
	return (value / camera.getCanvasHeightVirtualPixels()) * screenHeight;
}

function convertWorldSpaceToPixels_Virtual(value: number): number {
	const screenHeight = camera.getScreenHeightWorld(false);
	return (value / screenHeight) * camera.getCanvasHeightVirtualPixels();
}

function convertWorldSpaceToGrid(value: number): number {
	return value / boardpos.getBoardScale();
}

/**
 * Returns the coordinates of the center of the provided square.
 * Dependant on squareCenter.
 */
function getVisualCenterOfSquare(coords: Coords): Coords {
	const squareCenter = board.gsquareCenter();
	return [
		coords[0] - squareCenter + 0.5,
		coords[1] - squareCenter + 0.5
	];
}

export default {
	convertWorldSpaceToCoords,
	convertWorldSpaceToCoords_Rounded,
	convertCoordToWorldSpace,
	convertCoordToWorldSpace_IgnoreSquareCenter,
	convertPixelsToWorldSpace_Virtual,
	convertWorldSpaceToPixels_Virtual,
	convertWorldSpaceToGrid,
	getVisualCenterOfSquare,
};