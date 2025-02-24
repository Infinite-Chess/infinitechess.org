
/**
 * This generates and renders the mesh of the void squares
 * in the game.
 * It combines as many voids as possible to reduce
 * the mesh complexity.
 */

import type { BoundingBox } from '../../util/math.js';
import type { PooledArray } from '../../chess/logic/organizedlines.js';
import type { Coords, CoordsKey } from '../../chess/util/coordutil.js';
import type { Color } from '../../chess/util/colorutil.js';
// @ts-ignore
import type { gamefile } from '../../chess/logic/gamefile.js';


import { createModel } from './buffermodel.js';
import coordutil from '../../chess/util/coordutil.js';
import gameslot from '../chess/gameslot.js';
import frametracker from './frametracker.js';
// @ts-ignore
import statustext from '../gui/statustext.js';
// @ts-ignore
import board from './board.js';
// @ts-ignore
import movement from './movement.js';
// @ts-ignore
import piecesmodel from './piecesmodel.js';



const color: Color = [0, 0, 0, 1];
const color_wireframe: Color = [1, 0, 1, 1];

const stride: number = 6; // Using color shader. Stride per VERTEX (2 vertex, 4 color)
const POINTS_PER_SQUARE_WIREFRAME: number = 12; // Compared to  piecesmodel.POINTS_PER_SQUARE  which is 6 when rendering triangles

/** Enables wireframe mode */
let DEBUG: boolean = false;

function toggleDebug() {
	DEBUG = !DEBUG;
	statustext.showStatus(`Toggled wireframe voids: ${DEBUG}`, false, 0.5);
	regenModel(gameslot.getGamefile()!);
	const gamefile = gameslot.getGamefile()!;
	if (DEBUG && gamefile.voidMesh.data32 !== undefined) console.log("Number of triangles in void mesh: " + gamefile.voidMesh.data32.length / (stride * POINTS_PER_SQUARE_WIREFRAME / 2));
}

function regenModel(gamefile: gamefile) {
	/** A list of coordinates of all voids in the gamefile */
	const voidList = gameslot.getGamefile()!.ourPieces.voidsN;
	if (!voidList) return; // No voids are present in this game

	// Simplify the mesh by combining adjacent voids into larger rectangles!
	const simplifiedMesh = simplifyMesh(voidList);
	// [
	//     { left, right, bottom, top}, // rectangle
	//     ...
	// ]

	// How many indices will we need?
	const rectangleCount = simplifiedMesh.length;
	// console.log(`Void rectangle count: ${rectangleCount}`)
    
	const thisPointsPerSquare = !DEBUG ? piecesmodel.POINTS_PER_SQUARE : POINTS_PER_SQUARE_WIREFRAME;
	const indicesPerPiece = stride * thisPointsPerSquare; // 6 * (6 or 12) depending on wireframe
	const totalElements = rectangleCount * indicesPerPiece;

	gamefile.voidMesh.data64 = new Float64Array(totalElements); // Inits all 0's to begin..
	gamefile.voidMesh.data32 = new Float32Array(totalElements); // Inits all 0's to begin..

	let currIndex = 0;

	const data64 = gamefile.voidMesh.data64;
	const data32 = gamefile.voidMesh.data32;
	// Iterate through every void and append it's data!
	simplifiedMesh.forEach(thisRect => {
		const { left, bottom, right, top } = getCoordDataOfRectangle(gamefile, thisRect)
		;
		const colorToUse = !DEBUG ? color : color_wireframe;
		const funcToUse = !DEBUG ? getDataOfSquare : getDataOfSquare_Wireframe;
		const data = funcToUse(left, bottom, right, top, colorToUse);

		for (let a = 0; a < data.length; a++) {
			data64[currIndex] = data[a];
			data32[currIndex] = data[a];
			currIndex++;
		}
	});

	const mode = DEBUG ? "LINES" : "TRIANGLES";
	gamefile.voidMesh.model = createModel(data32, 2, mode, true);
	frametracker.onVisualChange();
}

// The passed in sides should be the center-coordinate value of the square in the corner
// For example, bottomleft square is [-5,-7], just pass in -5 for "left"
function getCoordDataOfRectangle(gamefile: gamefile, { left, right, bottom, top }: BoundingBox): BoundingBox { // Just pass in the rectangle
	const squareCenter = board.gsquareCenter();
	const startX = left - squareCenter - gamefile.mesh.offset[0];
	const startY = bottom - squareCenter - gamefile.mesh.offset[1];
	const width = right - left + 1;
	const height = top - bottom + 1;
	const endX = startX + width;
	const endY = startY + height;
	return { left: startX, right: endX, bottom: startY, top: endY };
}

// Returns an array of the data that can be entered into the buffer model!
function getDataOfSquare(startX: number, startY: number, endX: number, endY: number, color: Color): number[] {
	const [ r, g, b, a ] = color;
	return [
    //      Vertex               Color
        startX, startY,       r, g, b, a,
        startX, endY,         r, g, b, a,
        endX, startY,         r, g, b, a,

        endX, startY,         r, g, b, a,
        startX, endY,         r, g, b, a,
        endX, endY,           r, g, b, a
    ];
}

// Returns gl_lines data
function getDataOfSquare_Wireframe(startX: number, startY: number, endX: number, endY: number, color: Color): number[] {
	const [ r, g, b, a ] = color;
	return [
    //      Vertex               Color
        // Triangle 1
        startX, startY,       r, g, b, a,
        startX, endY,         r, g, b, a,

        startX, endY,         r, g, b, a,
        endX, startY,         r, g, b, a,

        endX, startY,         r, g, b, a,
        startX, startY,       r, g, b, a,

        // Triangle 2
        endX, startY,         r, g, b, a,
        startX, endY,         r, g, b, a,

        startX, endY,         r, g, b, a,
        endX, endY,           r, g, b, a,

        endX, endY,           r, g, b, a,
        endX, startY,         r, g, b, a
    ];
}

/**
 * Shifts the vertex data of the voids model and reinits it on the gpu.
 * @param {gamefile} gamefile - The gamefile
 * @param {number} diffXOffset - The x-amount to shift the voids vertex data
 * @param {number} diffYOffset - The y-amount to shift the voids vertex data
 */
function shiftModel(gamefile: gamefile, diffXOffset: number, diffYOffset: number): void {
	if (gamefile.voidMesh.model === undefined) return;
	
	const data64 = gamefile.voidMesh.data64;
	const data32 = gamefile.voidMesh.data32;
	for (let i = 0; i < data32.length; i += stride) {
		data64[i] += diffXOffset;
		data64[i + 1] += diffYOffset;
		data32[i] = data64[i];
		data32[i + 1] = data64[i + 1];
	}

	gamefile.voidMesh.model.updateBufferIndices(0, data64.length); // Reinit the model because its data has been updated
}

/**
 * Simplifies a list of void squares and merges them into larger rectangles.
 * @param voidList - The list of coordinates where all the voids are
 * @returns An array of rectangles that look like: `{ left, right, bottom, top }`.
 */
function simplifyMesh(voidList: PooledArray<Coords>): BoundingBox[] { // array of coordinates

	// console.log("Simplifying void mesh..")

	const voidHash: { [coordsKey: CoordsKey]: true } = {};
	for (const thisVoid of voidList) {
		if (!thisVoid) continue;
		const key = coordutil.getKeyFromCoords(thisVoid);
		voidHash[key] = true;
	}

	const rectangles: BoundingBox[] = []; // rectangle: { left, right, bottom, top }
	const alreadyMerged: { [coordsKey: CoordsKey]: true } = { }; // Set the coordinate key `x,y` to true when a void has been merged

	for (const thisVoid of voidList) { // [x,y]
		if (!thisVoid) continue;

		// Has this void already been merged with another previous?
		const key = coordutil.getKeyFromCoords(thisVoid);
		if (alreadyMerged[key]) continue; // Next void
		alreadyMerged[key] = true; // Set this void to true for next iteration

		let left = thisVoid[0];
		let right = thisVoid[0];
		let bottom = thisVoid[1];
		let top = thisVoid[1];
		let width = 1;
		let height = 1;

		let foundNeighbor = true;
		while (foundNeighbor) { // Keep expanding while successful

			// First test left neighbors

			let potentialMergers: CoordsKey[] = [];
			let allNeighborsAreVoid = true;
			let testX = left - 1;
			for (let a = 0; a < height; a++) { // Start from bottom and go up
				const thisTestY = bottom + a;
				const thisCoord: Coords = [testX, thisTestY];
				const thisKey = coordutil.getKeyFromCoords(thisCoord);
				const isVoid = voidHash[thisKey];
				if (!isVoid || alreadyMerged[thisKey]) {
					allNeighborsAreVoid = false;
					break; // Can't merge
				}
				potentialMergers.push(thisKey); // Can merge
			}
			if (allNeighborsAreVoid) { 
				left = testX; // Merge!
				width++;
				// Add all the merged squares to the already-merged list
				potentialMergers.forEach(key => { alreadyMerged[key] = true; });
				continue;
			}

			// Next test right neighbors

			potentialMergers = [];
			allNeighborsAreVoid = true;
			testX = right + 1;
			for (let a = 0; a < height; a++) { // Start from bottom and go up
				const thisTestY = bottom + a;
				const thisCoord: Coords = [testX, thisTestY];
				const thisKey = coordutil.getKeyFromCoords(thisCoord);
				const isVoid = voidHash[thisKey];
				if (!isVoid || alreadyMerged[thisKey]) {
					allNeighborsAreVoid = false;
					break; // Can't merge
				}
				potentialMergers.push(thisKey); // Can merge
			}
			if (allNeighborsAreVoid) { 
				right = testX; // Merge!
				width++;
				// Add all the merged squares to the already-merged list
				potentialMergers.forEach(key => { alreadyMerged[key] = true; });
				continue;
			}

			// Next test bottom neighbors

			potentialMergers = [];
			allNeighborsAreVoid = true;
			let testY = bottom - 1;
			for (let a = 0; a < width; a++) { // Start from bottom and go up
				const thisTestX = left + a;
				const thisCoord: Coords = [thisTestX, testY];
				const thisKey = coordutil.getKeyFromCoords(thisCoord);
				const isVoid = voidHash[thisKey];
				if (!isVoid || alreadyMerged[thisKey]) {
					allNeighborsAreVoid = false;
					break; // Can't merge
				}
				potentialMergers.push(thisKey); // Can merge
			}
			if (allNeighborsAreVoid) { 
				bottom = testY; // Merge!
				height++;
				// Add all the merged squares to the already-merged list
				potentialMergers.forEach(key => { alreadyMerged[key] = true; });
				continue;
			}

			// Next test top neighbors

			potentialMergers = [];
			allNeighborsAreVoid = true;
			testY = top + 1;
			for (let a = 0; a < width; a++) { // Start from bottom and go up
				const thisTestX = left + a;
				const thisCoord: Coords = [thisTestX, testY];
				const thisKey = coordutil.getKeyFromCoords(thisCoord);
				const isVoid = voidHash[thisKey];
				if (!isVoid || alreadyMerged[thisKey]) {
					allNeighborsAreVoid = false;
					break; // Can't merge
				}
				potentialMergers.push(thisKey); // Can merge
			}
			if (allNeighborsAreVoid) { 
				top = testY; // Merge!
				height++;
				// Add all the merged squares to the already-merged list
				potentialMergers.forEach(key => { alreadyMerged[key] = true; });
				continue;
			}

			foundNeighbor = false; // Cannot expand this rectangle! Stop searching
		}

		const rectangle: BoundingBox = { left, right, bottom, top };
		rectangles.push(rectangle);
	}

	// We now have a filled  rectangles  variable
	return rectangles;
}

/**
 * Called from pieces.renderPiecesInGame()
 * @param {gamefile} gamefile 
 * @returns 
 */
function render(gamefile: gamefile) {
	if (gamefile.voidMesh.model === undefined) return;

	const boardPos = movement.getBoardPos();
	const position: [number,number,number] = [ // Translate
        -boardPos[0] + gamefile.mesh.offset[0], // Add the model's offset. 
        -boardPos[1] + gamefile.mesh.offset[1],
        0
    ]; // While separate these are each big decimals, TOGETHER they are small number! That's fast for rendering!
	const boardScale = movement.getBoardScale();
	const scale: [number,number,number] = [boardScale, boardScale, 1];

	gamefile.voidMesh.model.render(position, scale);
}

export default {
	toggleDebug,
	regenModel,
	shiftModel,
	render
};