
// Import Start
import movement from './movement.js';
import options from './options.js';
import piecesmodel from './piecesmodel.js';
import game from '../chess/game.js';
import buffermodel from './buffermodel.js';
import board from './board.js';
import coordutil from '../../chess/util/coordutil.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('../chess/gamefile.js').gamefile} gamefile
*/

"use strict";

/**
 * This generates and renders the mesh of the void squares
 * in the game.
 * It combines as many voids as possible to reduce
 * the mesh complexity.
 */

const color = [0, 0, 0, 1];
const color_wireframe = [1, 0, 1, 1];

const stride = 6; // Using color shader. Stride per VERTEX (2 vertex, 4 color)
const POINTS_PER_SQUARE_WIREFRAME = 12; // Compared to  piecesmodel.POINTS_PER_SQUARE  which is 6 when rendering triangles

function regenModel(gamefile) {
	/** A list of coordinates of all voids in the gamefile */
	const voidList = game.getGamefile().ourPieces.voidsN;

	// Simplify the mesh by combining adjacent voids into larger rectangles!
	const simplifiedMesh = simplifyMesh(voidList);
	// [
	//     { left, right, bottom, top}, // rectangle
	//     ...
	// ]

	// How many indices will we need?
	const rectangleCount = simplifiedMesh.length;
	// console.log(`Void rectangle count: ${rectangleCount}`)
    
	const inDevMode = options.isDebugModeOn();
	const thisPointsPerSquare = !inDevMode ? piecesmodel.POINTS_PER_SQUARE : POINTS_PER_SQUARE_WIREFRAME;
	const indicesPerPiece = stride * thisPointsPerSquare; // 6 * (6 or 12) depending on wireframe
	const totalElements = rectangleCount * indicesPerPiece;

	gamefile.voidMesh.data64 = new Float64Array(totalElements); // Inits all 0's to begin..
	gamefile.voidMesh.data32 = new Float32Array(totalElements); // Inits all 0's to begin..

	let currIndex = 0;

	const data64 = gamefile.voidMesh.data64;
	const data32 = gamefile.voidMesh.data32;
	// Iterate through every void and append it's data!
	for (let i = 0; i < rectangleCount; i++) {
		const thisRect = simplifiedMesh[i];

		const { startX, startY, endX, endY } = getCoordDataOfRectangle(gamefile, thisRect);

		const colorToUse = !inDevMode ? color : color_wireframe;
		const funcToUse = !inDevMode ? getDataOfSquare : getDataOfSquare_Wireframe;
		const data = funcToUse(startX, startY, endX, endY, colorToUse);

		for (let a = 0; a < data.length; a++) {
			data64[currIndex] = data[a];
			data32[currIndex] = data[a];
			currIndex++;
		}
	}

	const mode = inDevMode ? "LINES" : "TRIANGLES";
	gamefile.voidMesh.model = buffermodel.createModel_Colored(data32, 2, mode);
}

// The passed in sides should be the center-coordinate value of the square in the corner
// For example, bottomleft square is [-5,-7], just pass in -5 for "left"
function getCoordDataOfRectangle(gamefile, {left, right, bottom, top}) { // Just pass in the rectangle
	const squareCenter = board.gsquareCenter();
	const startX = left - squareCenter - gamefile.mesh.offset[0];
	const startY = bottom - squareCenter - gamefile.mesh.offset[1];
	const width = right - left + 1;
	const height = top - bottom + 1;
	const endX = startX + width;
	const endY = startY + height;
	return { startX, startY, endX, endY };
}

// Returns an array of the data that can be entered into the buffer model!
function getDataOfSquare(startX, startY, endX, endY, color) {
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
function getDataOfSquare_Wireframe(startX, startY, endX, endY, color) {
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
function shiftModel(gamefile, diffXOffset, diffYOffset) {
	const data64 = gamefile.voidMesh.data64;
	const data32 = gamefile.voidMesh.data32;
	for (let i = 0; i < data32.length; i += stride) {
		data64[i] += diffXOffset;
		data64[i + 1] += diffYOffset;
		data32[i] = data64[i];
		data32[i + 1] = data64[i + 1];
	}

	gamefile.voidMesh.model.updateBuffer(); // Reinit the model because its data has been updated
}

/**
 * Simplifies a list of void squares and merges them into larger rectangles.
 * @param {array[]} voidList - The list of coordinates where all the voids are
 * @returns {array[]} An array of rectangles that look like: `{ left, right, bottom, top }`.
 */
function simplifyMesh(voidList) { // array of coordinates

	// console.log("Simplifying void mesh..")

	const voidHash = { };
	for (const thisVoid of voidList) {
		const key = coordutil.getKeyFromCoords(thisVoid);
		voidHash[key] = true;
	}

	const rectangles = []; // rectangle: { left, right, bottom, top }
	const alreadyMerged = { }; // Set the coordinate key `x,y` to true when a void has been merged

	for (const thisVoid of voidList) { // [x,y]

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

			let potentialMergers = [];
			let allNeighborsAreVoid = true;
			let testX = left - 1;
			for (let a = 0; a < height; a++) { // Start from bottom and go up
				const thisTestY = bottom + a;
				const thisCoord = [testX, thisTestY];
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
				const thisCoord = [testX, thisTestY];
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
				const thisCoord = [thisTestX, testY];
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
				const thisCoord = [thisTestX, testY];
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

		const rectangle = { left, right, bottom, top };
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
function render(gamefile) {
	if (gamefile.voidMesh.model === undefined) return;

	const boardPos = movement.getBoardPos();
	const position = [ // Translate
        -boardPos[0] + gamefile.mesh.offset[0], // Add the model's offset. 
        -boardPos[1] + gamefile.mesh.offset[1],
        0
    ]; // While separate these are each big decimals, TOGETHER they are small number! That's fast for rendering!
	const boardScale = movement.getBoardScale();
	const scale = [boardScale, boardScale, 1];

	gamefile.voidMesh.model.render(position, scale);
}

export default {
	regenModel,
	shiftModel,
	render
};