
// src/client/scripts/esm/game/misc/space.ts

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


import camera from "../rendering/camera.js";
import boardpos from '../rendering/boardpos.js';
import bd from "../../../../../shared/util/bigdecimal/bigdecimal.js";
import board from "../rendering/boardtiles.js";

import type { BDCoords, Coords, DoubleCoords } from '../../../../../shared/chess/util/coordutil.js';
import type { BigDecimal } from '../../../../../shared/util/bigdecimal/bigdecimal.js';


const HALF: BigDecimal = bd.FromNumber(0.5);


/**
 * Since the camera is fixed in place, with the board moving and scaling below it,
 * this depends on your position and scale.
 */
function convertWorldSpaceToCoords(worldCoords: DoubleCoords): BDCoords {
	const boardPos: BDCoords = boardpos.getBoardPos();
	const boardScale: BigDecimal = boardpos.getBoardScale();
	return [
		convertWorldSpaceToCoords_Axis(worldCoords[0], boardScale, boardPos[0]),
		convertWorldSpaceToCoords_Axis(worldCoords[1], boardScale, boardPos[1])
	];
}

/** Converts a single axis' coordinates from world space to squares. */
function convertWorldSpaceToCoords_Axis(worldCoords: number, boardScale: BigDecimal, boardPos: BigDecimal): BigDecimal {
	const positionBD = bd.FromNumber(worldCoords);
	return bd.add(bd.divide_floating(positionBD, boardScale), boardPos);
}

/** Returns the integer square coordinate that includes the floating point square coords inside its area. */
function convertWorldSpaceToCoords_Rounded(worldCoords: DoubleCoords): Coords {
	const coordsBD: BDCoords = convertWorldSpaceToCoords(worldCoords);
	return roundCoords(coordsBD);
}

/** Returns the integer coordinate that contains the floating point coordinate provided. */
function roundCoord(coord: BigDecimal): bigint {
	const squareCenter = board.getSquareCenter();
	return bd.toBigInt(bd.floor(bd.add(coord, squareCenter)));
}

/** Returns the integer coordinates that contain the floating point coordinate provided. */
function roundCoords(coords: BDCoords): Coords {
	return [roundCoord(coords[0]), roundCoord(coords[1])];
}

// Takes a square coordinate, returns the world-space location of the square's VISUAL center! Dependant on board.getSquareCenter().
function convertCoordToWorldSpace(coords: BDCoords, position: BDCoords = boardpos.getBoardPos(), scale: BigDecimal = boardpos.getBoardScale()): DoubleCoords {
	const squareCenter = board.getSquareCenter();

	const halfMinusSquareCenter = bd.subtract(HALF, squareCenter);

	function getAxis(coord: BigDecimal, position: BigDecimal): number {
		const diff = bd.subtract(coord, position);
		const diffPlusHalf = bd.add(diff, halfMinusSquareCenter);
		const scaled = bd.multiply_floating(diffPlusHalf, scale);
		return bd.toNumber(scaled);
	}

	// (coords[0] - position[0] + 0.5 - squareCenter) * scale
	return [
		getAxis(coords[0], position[0]),
		getAxis(coords[1], position[1])
	];
}

function convertCoordToWorldSpace_IgnoreSquareCenter(coords: BDCoords, position = boardpos.getBoardPos(), scale = boardpos.getBoardScale()): DoubleCoords {
	function getAxis(coord: BigDecimal, position: BigDecimal): number {
		const diff = bd.subtract(coord, position);
		const scaled = bd.multiply_floating(diff, scale);
		return bd.toNumber(scaled);
	}
	// (coords[0] - position[0]) * scale
	return [
		getAxis(coords[0], position[0]),
		getAxis(coords[1], position[1])
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

/** Tells you how many square units span the grid value you pass in. */
function convertWorldSpaceToGrid(value: number): BigDecimal {
	const valueBD = bd.FromNumber(value);
	const scale = boardpos.getBoardScale();
	// value / scale
	return bd.divide_floating(valueBD, scale);
}


export default {
	convertWorldSpaceToCoords,
	convertWorldSpaceToCoords_Axis,
	convertWorldSpaceToCoords_Rounded,
	roundCoord,
	roundCoords,
	convertCoordToWorldSpace,
	convertCoordToWorldSpace_IgnoreSquareCenter,
	convertPixelsToWorldSpace_Virtual,
	convertWorldSpaceToPixels_Virtual,
	convertWorldSpaceToGrid,
};