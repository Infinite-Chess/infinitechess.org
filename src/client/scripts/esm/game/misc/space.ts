
/**
 * This script converts world-space coordinates to square coordinates, and vice verca.
 * 
 * Where square coordinates are where the pieces are located,
 * world-space coordinates are where in space objects are actually rendered.
 * 
 * There is also pixel space, which is the [x,y] coordinate of virtual pixels on the screen.
 */


import type { Coords } from '../../chess/util/coordutil.js'


// @ts-ignore
import board from "../rendering/board.js";
// @ts-ignore
import camera from "../rendering/camera.js";
// @ts-ignore
import movement from "../rendering/movement.js";



function convertWorldSpaceToCoords(worldCoords: Coords): Coords {

	const boardPos = movement.getBoardPos();
	const boardScale = movement.getBoardScale();
	const xCoord = worldCoords[0] / boardScale + boardPos[0];
	const yCoord = worldCoords[1] / boardScale + boardPos[1];

	return [xCoord, yCoord];
}

function convertWorldSpaceToCoords_Rounded(worldCoords: Coords): Coords {

	const boardPos = movement.getBoardPos();
	const boardScale = movement.getBoardScale();
	const xCoord = worldCoords[0] / boardScale + boardPos[0];
	const yCoord = worldCoords[1] / boardScale + boardPos[1];

	const squareCenter = board.gsquareCenter();
	return [Math.floor(xCoord + squareCenter), Math.floor(yCoord + squareCenter)];
}

// Takes a square coordinate, returns the world-space location of the square's VISUAL center! Dependant on board.gsquareCenter().
function convertCoordToWorldSpace(coords: Coords, position: Coords = movement.getBoardPos(), scale: number = movement.getBoardScale()): Coords {

	const worldX = (coords[0] - position[0] + 0.5 - board.gsquareCenter()) * scale;
	const worldY = (coords[1] - position[1] + 0.5 - board.gsquareCenter()) * scale;

	return [worldX, worldY];
}

function convertCoordToWorldSpace_IgnoreSquareCenter(coords: Coords, position = movement.getBoardPos(), scale = movement.getBoardScale()): Coords {
	
	const worldX = (coords[0] - position[0]) * scale;
	const worldY = (coords[1] - position[1]) * scale;

	return [worldX, worldY];
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
	return value / movement.getBoardScale();
}

export default {
	convertWorldSpaceToCoords,
	convertWorldSpaceToCoords_Rounded,
	convertCoordToWorldSpace,
	convertCoordToWorldSpace_IgnoreSquareCenter,
	convertPixelsToWorldSpace_Virtual,
	convertWorldSpaceToPixels_Virtual,
	convertWorldSpaceToGrid,
};