'use strict';

// Import Start
// @ts-ignore
import gamefile from "./gamefile.js";
import { Coords } from "./movesets.js";
// @ts-ignore
import getSpecialMoves from "./specialdetect.js";
// Import End

// Coordinates in the form [x, y, boardX, boardY]
type FiveDimensionalCoords = [number, number, number, number];

function TwoDToFiveDCoords(coords: Coords): FiveDimensionalCoords {
	return [coords[0] % 10, coords[1] % 10, Math.floor(coords[0] / 10), Math.floor(coords[1] / 10)];
}

function FiveDToTwoDCoords(coords: FiveDimensionalCoords): Coords {
	return [coords[0] + coords[2] * 10, coords[1] + coords[2] * 10];
}

function fivedimensionalpawnmove(gamefile: gamefile, coords: Coords, color: string): Coords[] {
	const fiveDCoords = TwoDToFiveDCoords(coords);
	// eslint-disable-next-line prefer-const
	let legalMoves: FiveDimensionalCoords[] = [];
	// eslint-disable-next-line prefer-const
	let legalSpacelike: Coords[] = [];
	// eslint-disable-next-line prefer-const
	let legalTimelike: Coords[] = [];
	const spacelikeCoords = [fiveDCoords[0], fiveDCoords[1]] as Coords;
	const timelikeCoords = [fiveDCoords[2], fiveDCoords[3]] as Coords;
	// eslint-disable-next-line no-unused-vars
	const checkPawnMove = getSpecialMoves.getSpecialMoves().pawns as (gamefile: gamefile, coords: Coords, color: string, moves: Coords[]) => void;
	checkPawnMove(gamefile, spacelikeCoords, color, legalSpacelike);
	checkPawnMove(gamefile, timelikeCoords, color, legalTimelike);
	for (const coord of legalSpacelike) {
		legalMoves.push([coord[0], coord[1], fiveDCoords[2], fiveDCoords[3]]);
	}
	for (const coord of legalTimelike) {
		legalMoves.push([fiveDCoords[0], fiveDCoords[1], coord[0], coord[1]]);
	}
	return legalMoves.map(value => FiveDToTwoDCoords(value));
}

function equals(a: Object, b: Object): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export default {
	fivedimensionalpawnmove
};