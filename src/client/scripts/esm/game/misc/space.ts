
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


// @ts-ignore
import camera from "../rendering/camera.js";
import boardpos from '../rendering/boardpos.js';
import bigdecimal from "../../util/bigdecimal/bigdecimal.js";
import board from "../rendering/boardtiles.js";

import type { BDCoords, Coords, DoubleCoords } from '../../chess/util/coordutil.js';
import type { BigDecimal } from '../../util/bigdecimal/bigdecimal.js';


const HALF: BigDecimal = bigdecimal.FromNumber(0.5);


/**
 * Since the camera is fixed in place, with the board moving and scaling below it,
 * this depends on your position and scale.
 */
function convertWorldSpaceToCoords(worldCoords: DoubleCoords): BDCoords {
	const boardPos: BDCoords = boardpos.getBoardPos();
	const boardScale: BigDecimal = boardpos.getBoardScale();

	function getAxis(worldCoords: number, boardPos: BigDecimal): BigDecimal {
		const positionBD = bigdecimal.FromNumber(worldCoords);
		return bigdecimal.add(bigdecimal.divide_floating(positionBD, boardScale), boardPos);
	}

	return [
		getAxis(worldCoords[0], boardPos[0]),
		getAxis(worldCoords[1], boardPos[1])
	];
}

/** Returns the integer square coordinate that includes the floating point square coords inside its area. */
function convertWorldSpaceToCoords_Rounded(worldCoords: DoubleCoords): Coords {
	const coordsBD: BDCoords = convertWorldSpaceToCoords(worldCoords);
	return roundCoords(coordsBD);
}

/** Returns the integer coordinates that contain the floating point coordinate provided. */
function roundCoords(coords: BDCoords): Coords {
	const squareCenter = board.gsquareCenter();

	function roundAxis(coord: BigDecimal): bigint {
		const floorBD = bigdecimal.floor(bigdecimal.add(coord, squareCenter));
		return bigdecimal.toBigInt(floorBD);
	}

	return [
		roundAxis(coords[0]),
		roundAxis(coords[1])
	];
}

// Takes a square coordinate, returns the world-space location of the square's VISUAL center! Dependant on board.gsquareCenter().
function convertCoordToWorldSpace(coords: Coords, position: BDCoords = boardpos.getBoardPos(), scale: BigDecimal = boardpos.getBoardScale()): DoubleCoords {
	const squareCenter = board.gsquareCenter();

	const halfMinusSquareCenter = bigdecimal.subtract(HALF, squareCenter);

	function getAxis(coord: bigint, position: BigDecimal): number {
		const coordBD = bigdecimal.FromBigInt(coord);
		const diff = bigdecimal.subtract(coordBD, position);
		const diffPlusHalf = bigdecimal.add(diff, halfMinusSquareCenter);
		const scaled = bigdecimal.multiply_floating(diffPlusHalf, scale);
		return bigdecimal.toNumber(scaled);
	}

	// (coords[0] - position[0] + 0.5 - squareCenter) * scale
	return [
		getAxis(coords[0], position[0]),
		getAxis(coords[1], position[1])
	];
}

function convertCoordToWorldSpace_IgnoreSquareCenter(coords: Coords, position = boardpos.getBoardPos(), scale = boardpos.getBoardScale()): DoubleCoords {
	function getAxis(coord: bigint, position: BigDecimal): number {
		const coordBD = bigdecimal.FromBigInt(coord);
		const diff = bigdecimal.subtract(coordBD, position);
		const scaled = bigdecimal.multiply_floating(diff, scale);
		return bigdecimal.toNumber(scaled);
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
	const valueBD = bigdecimal.FromNumber(value);
	const scale = boardpos.getBoardScale();
	// value / scale
	return bigdecimal.divide_floating(valueBD, scale);
}


export default {
	convertWorldSpaceToCoords,
	convertWorldSpaceToCoords_Rounded,
	roundCoords,
	convertCoordToWorldSpace,
	convertCoordToWorldSpace_IgnoreSquareCenter,
	convertPixelsToWorldSpace_Virtual,
	convertWorldSpaceToPixels_Virtual,
	convertWorldSpaceToGrid,
};