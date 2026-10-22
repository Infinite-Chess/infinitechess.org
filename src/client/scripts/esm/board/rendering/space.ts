// src/client/scripts/esm/board/rendering/space.ts

/**
 * This script converts world-space coordinates to square coordinates, and vice versa.
 *
 * Where square coordinates are where the pieces are located,
 * world-space coordinates are where in space objects are actually rendered.
 *
 * There is also pixel space, which is the [x,y] coordinate of virtual pixels on the screen.
 *
 * Grid space: 1 unit = width of 1 square
 */

import type { Camera } from './camera.js';
import type { BoardPos } from './boardpos.js';
import type { BDCoords, Coords, DoubleCoords } from '../../../../../shared/util/coordutil.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import boardgeometry from './boardgeometry.js';

// Constants -------------------------------------------------------------------

const HALF: BigDecimal = bd.fromNumber(0.5);

// World Space to Grid Space ---------------------------------------------------

/**
 * Since the camera is fixed in place, with the board moving and scaling below it,
 * this depends on your position and scale.
 */
function convertWorldSpaceToCoords(bpos: BoardPos, worldCoords: DoubleCoords): BDCoords {
	const boardPos: BDCoords = bpos.getBoardPos();
	const boardScale: BigDecimal = bpos.getBoardScale();
	return [
		convertWorldSpaceToCoords_Axis(worldCoords[0], boardScale, boardPos[0]),
		convertWorldSpaceToCoords_Axis(worldCoords[1], boardScale, boardPos[1]),
	];
}

/** Converts a single axis' coordinates from world space to squares. */
function convertWorldSpaceToCoords_Axis(
	worldCoords: number,
	boardScale: BigDecimal,
	boardPos: BigDecimal,
): BigDecimal {
	const positionBD = bd.fromNumber(worldCoords);
	return bd.add(bd.divideFloating(positionBD, boardScale), boardPos);
}

/** Returns the integer square coordinate that includes the floating point square coords inside its area. */
function convertWorldSpaceToCoords_Rounded(bpos: BoardPos, worldCoords: DoubleCoords): Coords {
	const coordsBD: BDCoords = convertWorldSpaceToCoords(bpos, worldCoords);
	return roundCoords(coordsBD);
}

/** Returns the integer coordinate that contains the floating point coordinate provided. */
function roundCoord(coord: BigDecimal): bigint {
	const squareCenter = boardgeometry.getSquareCenter();
	return bd.toBigInt(bd.floor(bd.add(coord, squareCenter)));
}

/** Returns the integer coordinates that contain the floating point coordinate provided. */
function roundCoords(coords: BDCoords): Coords {
	return [roundCoord(coords[0]), roundCoord(coords[1])];
}

// Grid Space to World Space ---------------------------------------------------

/**
 * Takes a square coordinate, returns the world-space location of the
 * square's VISUAL center. Depends on boardgeometry.getSquareCenter().
 */
function convertCoordToWorldSpace(
	coords: BDCoords,
	position: BDCoords,
	scale: BigDecimal,
): DoubleCoords {
	const squareCenter = boardgeometry.getSquareCenter();

	const halfMinusSquareCenter = bd.subtract(HALF, squareCenter);

	function getAxis(coord: BigDecimal, position: BigDecimal): number {
		const diff = bd.subtract(coord, position);
		const diffPlusHalf = bd.add(diff, halfMinusSquareCenter);
		const scaled = bd.multiplyFloating(diffPlusHalf, scale);
		return bd.toNumber(scaled);
	}

	// (coords[0] - position[0] + 0.5 - squareCenter) * scale
	return [getAxis(coords[0], position[0]), getAxis(coords[1], position[1])];
}

/** Takes a square coordinate, returns its world-space location, ignoring the square center. */
function convertCoordToWorldSpace_IgnoreSquareCenter(
	coords: BDCoords,
	position: BDCoords,
	scale: BigDecimal,
): DoubleCoords {
	function getAxis(coord: BigDecimal, position: BigDecimal): number {
		const diff = bd.subtract(coord, position);
		const scaled = bd.multiplyFloating(diff, scale);
		return bd.toNumber(scaled);
	}
	// (coords[0] - position[0]) * scale
	return [getAxis(coords[0], position[0]), getAxis(coords[1], position[1])];
}

// Pixel Conversions -----------------------------------------------------------

/** Converts a measurement of virtual screen pixels to world space units. Dependant on the current screen height. */
function convertPixelsToWorldSpace_Virtual(cam: Camera, value: number): number {
	const screenHeight = cam.getScreenHeightWorld(false);
	return (value / cam.getCanvasHeightVirtualPixels()) * screenHeight;
}

/** Tells you how many square units span the grid value you pass in. */
function convertWorldSpaceToGrid(bpos: BoardPos, value: number): BigDecimal {
	const valueBD = bd.fromNumber(value);
	const scale = bpos.getBoardScale();
	// value / scale
	return bd.divideFloating(valueBD, scale);
}

// Exports ---------------------------------------------------------------------

export default {
	convertWorldSpaceToCoords,
	convertWorldSpaceToCoords_Axis,
	convertWorldSpaceToCoords_Rounded,
	roundCoord,
	roundCoords,
	convertCoordToWorldSpace,
	convertCoordToWorldSpace_IgnoreSquareCenter,
	convertPixelsToWorldSpace_Virtual,
	convertWorldSpaceToGrid,
};
