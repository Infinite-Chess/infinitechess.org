
// Import Start
import loadbalancer from '../misc/loadbalancer.js';
import math from '../../util/math.js';
import onlinegame from '../misc/onlinegame.js';
import bufferdata from './bufferdata.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import game from '../chess/game.js';
import stats from '../gui/stats.js';
import voids from './voids.js';
import statustext from '../gui/statustext.js';
import movement from './movement.js';
import perspective from './perspective.js';
import buffermodel from './buffermodel.js';
import options from './options.js';
import colorutil from '../../chess/util/colorutil.js';
import jsutil from '../../util/jsutil.js';
import frametracker from './frametracker.js';
import thread from '../../util/thread.js';
import coordutil from '../../chess/util/coordutil.js';
import spritesheet from './spritesheet.js';
import shapes from './shapes.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
*/

"use strict";

/**
 * This contains the functions for generating, modifying,
 * and rendering the mesh of the pieces of a gamefile
 */

const strideWithTexture = 4; // Using texture shader. Stride per VERTEX
const strideWithColoredTexture = 8;
const POINTS_PER_SQUARE = 6; // Number of vertices used to render a square (2 triangles)

/**
 * The interval at which to modify the mesh's linear offset once you travel this distance.
 * 10,000 was arbitrarily chose because once you reach uniform translations much bigger
 * than that, the rendering of the pieces start to get gittery.
 */
const REGEN_RANGE = 10_000;

const DISTANCE_AT_WHICH_MESH_GLITCHES = Number.MAX_SAFE_INTEGER; // ~9 Quadrillion


/**
 * Generates the model that contains every single piece on the board, but *excluding* voids.
 * (But will herein call the method that regenerates the void mesh)
 * This is expensive. This is ~200 times slower than just rendering. Minimize calling this.
 * When drawing, we'll need to specify the uniform transformations according to our camera position.
 * @param {gamefile} gamefile - The gamefile of which to regenerate the mesh of the pieces
 * @param {Object} [colorArgs] - Optional. The color arguments to dye the pieces a custom tint. Example: `{ white: [r,g,b,a], black: [r,g,b,a] }`
 * @param {boolean} [giveStatus] Optional. If true, displays a message when the model is complete. Default: false
 */
async function regenModel(gamefile, colorArgs, giveStatus) { // giveStatus can be undefined
	if (!gamefile) return;
	if (gamefile.mesh.isGenerating) return;
	gamefile.mesh.locked++;
	gamefile.mesh.isGenerating++;

	console.log("Regenerating pieces model.");

	// Whenever you move 10,000 tiles away, the piece rendering starts to get gittery, SO regen the model with an offset! No more gittering!
	// Do we need an offset? Calculate the nearest 10,000

	gamefile.mesh.offset = math.roundPointToNearestGridpoint(movement.getBoardPos(), REGEN_RANGE);

	// How many indeces will we need?
	const totalPieceCount = gamefileutility.getPieceCount_IncludingUndefineds(gamefile);
	const thisStride = colorArgs ? strideWithColoredTexture : strideWithTexture; // 4 or 8
	const indicesPerPiece = thisStride * POINTS_PER_SQUARE; // (4|8) * 6
	const totalElements = totalPieceCount * indicesPerPiece;

	const usingColoredTextures = colorArgs !== undefined;
	const mesh = {
		data64: new Float64Array(totalElements), // Inits all 0's to begin..
		data32: new Float32Array(totalElements), // Inits all 0's to begin..
		stride: thisStride,
		/** @type {BufferModel} */
		model: undefined,
		usingColoredTextures
	};

	const weAreBlack = onlinegame.areInOnlineGame() && onlinegame.areWeColor("black");
	const rotation = weAreBlack ? -1 : 1;

	let currIndex = 0;

	// How much time can we spend on this potentially long task?
	let pieceLimitToRecalcTime = 1000;
	let startTime = performance.now();
	let timeToStop = startTime + loadbalancer.getLongTaskTime();
	let piecesSinceLastCheck = 0;
	let piecesComplete = 0;

	stats.showPiecesMesh();

	// Iterates through every single piece and performs specified function on said piece
	for (const pieceType in gamefile.ourPieces) {
		if (pieceType.startsWith('voids')) continue;
		await concatBufferData(pieceType);
	}

	// Adds pieces of that type's buffer to the overall data
	async function concatBufferData(pieceType) {
		if (gamefile.mesh.terminate) return;
		const thesePieces = game.getGamefile().ourPieces[pieceType];

		const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(pieceType, rotation);

		if (colorArgs) {
			const pieceColor = colorutil.getPieceColorFromType(pieceType);
			const colorArray = colorArgs[pieceColor]; // [r,g,b,a]
			// var's are FUNCTION-scoped!
			/* eslint-disable no-var */
			var r = colorArray[0];
			var g = colorArray[1];
			var b = colorArray[2];
			var a = colorArray[3];
			/* eslint-enable no-var */
		}

		for (let i = 0; i < thesePieces.length; i++) {
			const thisPiece = thesePieces[i];

			// If the piece is undefined, just leave the 0's there..
			if (!thisPiece) {
				currIndex += indicesPerPiece;
				continue;
			}

			const offsetCoord = coordutil.subtractCoordinates(thisPiece, gamefile.mesh.offset);
			const { left, right, bottom, top } = shapes.getBoundingBoxOfCoord(offsetCoord);

			const data = colorArgs ? bufferdata.getDataQuad_ColorTexture(left, bottom, right, top, texleft, texbottom, texright, textop, r, g, b, a)
                : bufferdata.getDataQuad_Texture(left, bottom, right, top, texleft, texbottom, texright, textop);

			for (let a = 0; a < data.length; a++) {
				mesh.data64[currIndex] = data[a];
				mesh.data32[currIndex] = data[a];
				currIndex++;
			}

			// If we've spent too much time, sleep!
			piecesSinceLastCheck++;
			piecesComplete++;
			if (piecesSinceLastCheck >= pieceLimitToRecalcTime) {
				piecesSinceLastCheck = 0;
				await sleepIfUsedTooMuchTime();
				if (gamefile.mesh.terminate) return;
				if (loadbalancer.getForceCalc()) {
					pieceLimitToRecalcTime = Infinity;
					loadbalancer.setForceCalc(false);
				}
			}
		}
	}

	async function sleepIfUsedTooMuchTime() {

		if (!usedTooMuchTime()) return; // Keep processing...

		// console.log(`Too much! Sleeping.. Used ${performance.now() - startTime} of our allocated ${maxTimeToSpend}`)
		const percentComplete = piecesComplete / totalPieceCount;
		stats.updatePiecesMesh(percentComplete);
		await thread.sleep(0);
		startTime = performance.now();
		timeToStop = startTime + loadbalancer.getLongTaskTime();
	}

	function usedTooMuchTime() {
		return performance.now() >= timeToStop;
	}

	stats.hidePiecesMesh();
	if (gamefile.mesh.terminate) {
		console.log("Mesh generation terminated.");
		gamefile.mesh.terminate = false;
		gamefile.mesh.locked--;
		gamefile.mesh.isGenerating--;
		return;
	}

	mesh.model = colorArgs ? buffermodel.createModel_ColorTextured(mesh.data32, 2, "TRIANGLES", spritesheet.getSpritesheet())
                            : buffermodel.createModel_Textured(mesh.data32, 2, "TRIANGLES", spritesheet.getSpritesheet());
	//                     : buffermodel.createModel_TintTextured(mesh.data32, 2, "TRIANGLES", spritesheet.getSpritesheet());

	jsutil.copyPropertiesToObject(mesh, gamefile.mesh);
    
	// If we are also in perspective mode, init the rotated model as well!
	if (perspective.getEnabled()) await initRotatedPiecesModel(game.getGamefile(), true); // ignoreLock

	if (gamefile.mesh.terminate) {
		gamefile.mesh.terminate = false;
		gamefile.mesh.locked--;
		gamefile.mesh.isGenerating--;
		return;
	}

	voids.regenModel(gamefile);

	if (giveStatus) statustext.showStatus(translations.rendering.regenerated_pieces, false, 0.5);
    
	frametracker.onVisualChange();

	gamefile.mesh.locked--;
	gamefile.mesh.isGenerating--;
}

/**
 * Modifies the vertex data of the specified piece within the game's mesh data
 * to the destination coordinates. Then sends that change off to the gpu.
 * FAST, much faster than regenerating the entire mesh!
 * @param {gamefile} gamefile - The gamefile the piece belongs to
 * @param {Object} piece - The piece: `{ type, index }`
 * @param {number[]} newCoords - The destination coordinates
 */
function movebufferdata(gamefile, piece, newCoords) {
	if (!gamefile.mesh.data64) throw new Error("Should not be moving piece data when data64 is not defined!");
	if (!gamefile.mesh.data32) throw new Error("Should not be moving piece data when data32 is not defined!");
    
	const index = gamefileutility.calcPieceIndexInAllPieces(gamefile, piece);

	const stridePerPiece = gamefile.mesh.stride * POINTS_PER_SQUARE;

	const i = index * stridePerPiece;

	const offsetCoord = coordutil.subtractCoordinates(newCoords, gamefile.mesh.offset);
	const { left, right, bottom, top } = shapes.getBoundingBoxOfCoord(offsetCoord);

	const stride = gamefile.mesh.stride;

	moveData(gamefile.mesh.data64);
	moveData(gamefile.mesh.data32);
    
	if (perspective.getEnabled()) {
		moveData(gamefile.mesh.rotatedData64);
		moveData(gamefile.mesh.rotatedData32);
	}

	function moveData(array) {
		array[i] = left;
		array[i + 1] = bottom;
		array[i + stride * 1] = left;
		array[i + stride * 1 + 1] = top;
		array[i + stride * 2] = right;
		array[i + stride * 2 + 1] = bottom;
		array[i + stride * 3] = right;
		array[i + stride * 3 + 1] = bottom;
		array[i + stride * 4] = left;
		array[i + stride * 4 + 1] = top;
		array[i + stride * 5] = right;
		array[i + stride * 5 + 1] = top;
	}

	// Update the buffer on the gpu!

	const numbIndicesChanged = stride * 5 + 2;
	gamefile.mesh.model.updateBufferIndices(i, numbIndicesChanged);
	if (perspective.getEnabled()) gamefile.mesh.rotatedModel.updateBufferIndices(i, numbIndicesChanged);
}

// Overwrites the piece's vertex data with 0's, 


/**
 * Overwrites the vertex data of the specified piece with 0's within the game's mesh data,
 * INCLUDING its texture coords! Then sends that change off to the gpu.
 * FAST, much faster than regenerating the entire mesh!
 * @param {gamefile} gamefile - The gamefile the piece belongs to
 * @param {Object} piece - The piece: `{ type, index }`
 */
function deletebufferdata(gamefile, piece) {
	if (!gamefile.mesh.data64) throw new Error("Should not be deleting piece data when data64 is not defined!");
	if (!gamefile.mesh.data32) throw new Error("Should not be deleting piece data when data32 is not defined!");
	const index = gamefileutility.calcPieceIndexInAllPieces(gamefile, piece);

	const stridePerPiece = gamefile.mesh.stride * POINTS_PER_SQUARE;
	const i = index * stridePerPiece; // Start index of deleted piece

	for (let a = 0; a < stridePerPiece; a++) {
		const thisIndex = i + a;
		gamefile.mesh.data64[thisIndex] = 0;
		gamefile.mesh.data32[thisIndex] = 0;
	}

	if (perspective.getEnabled()) {
		for (let a = 0; a < stridePerPiece; a++) {
			const thisIndex = i + a;
			gamefile.mesh.rotatedData64[thisIndex] = 0;
			gamefile.mesh.rotatedData32[thisIndex] = 0;
		}
	}

	// Update the buffer on the gpu!

	const numbIndicesChanged = stridePerPiece;
	gamefile.mesh.model.updateBufferIndices(i, numbIndicesChanged);
	if (perspective.getEnabled()) gamefile.mesh.rotatedModel.updateBufferIndices(i, numbIndicesChanged);
}

/**
 * Overwrites the vertex data of the specified piece within the game's mesh data
 * with the specified piece type. Then sends that change off to the gpu.
 * Typically call this to overwrite exising placeholder 0's, such as when pawns promote.
 * FAST, much faster than regenerating the entire mesh!
 * @param {gamefile} gamefile - The gamefile the piece belongs to
 * @param {Object} undefinedPiece - The undefined piece placeholder: `{ type, index }`
 * @param {number[]} coords - The destination coordinates
 * @param {string} type - The type of piece to write
 */
function overwritebufferdata(gamefile, undefinedPiece, coords, type) {
	if (!gamefile.mesh.data64) return console.error("Should not be overwriting piece data when data64 is not defined!");
	if (!gamefile.mesh.data32) return console.error("Should not be overwriting piece data when data32 is not defined!");
    
	const index = gamefileutility.calcPieceIndexInAllPieces(gamefile, undefinedPiece);

	const stridePerPiece = gamefile.mesh.stride * POINTS_PER_SQUARE;
	const i = index * stridePerPiece;

	const weAreBlack = onlinegame.areInOnlineGame() && onlinegame.areWeColor("black");
	const rotation = weAreBlack ? -1 : 1;

	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(type, rotation);
	const offsetCoord = coordutil.subtractCoordinates(coords, gamefile.mesh.offset);
	const { left, right, bottom, top } = shapes.getBoundingBoxOfCoord(offsetCoord);

	let data;
	if (gamefile.mesh.usingColoredTextures) {
		const colorArgs = options.getPieceRegenColorArgs();
		const pieceColor = colorutil.getPieceColorFromType(type);
		const colorArray = colorArgs[pieceColor]; // [r,g,b,a]
		const [r,g,b,a] = colorArray;

		data = bufferdata.getDataQuad_ColorTexture(left, bottom, right, top, texleft, texbottom, texright, textop, r, g, b, a); 

	} else data = bufferdata.getDataQuad_Texture(left, bottom, right, top, texleft, texbottom, texright, textop);

	for (let a = 0; a < data.length; a++) {
		const thisIndex = i + a;
		gamefile.mesh.data64[thisIndex] = data[a];
		gamefile.mesh.data32[thisIndex] = data[a];
	}

	// Now overwrite the rotated model data!
	if (perspective.getEnabled()) {
		const usingColoredPieces = gamefile.mesh.usingColoredTextures;
		const rotatedData = usingColoredPieces ? bufferdata.rotateDataColorTexture(data, rotation) : bufferdata.rotateDataTexture(data, rotation);

		for (let a = 0; a < rotatedData.length; a++) {
			const thisIndex = i + a;
			gamefile.mesh.rotatedData64[thisIndex] = rotatedData[a];
			gamefile.mesh.rotatedData32[thisIndex] = rotatedData[a];
		}
	}

	// Update the buffer on the gpu!

	const numbIndicesChanged = data.length;
	gamefile.mesh.model.updateBufferIndices(i, numbIndicesChanged);
	if (perspective.getEnabled()) gamefile.mesh.rotatedModel.updateBufferIndices(i, numbIndicesChanged);
}

/**
 * Utility function for printing the vertex data of the specific piece at
 * the specified coords, within the mesh data of the gamefile.
 * @param {gamefile} coords - The gamefile
 * @param {number[]} coords - The coordiantes of the piece
 */
function printbufferdataOnCoords(gamefile, coords) {
	// Find the piece on the coords
	const piece = gamefileutility.getPieceAtCoords(gamefile, coords);
	if (!piece) console.log("No piece at these coords to retrieve data from!");

	const index = gamefileutility.calcPieceIndexInAllPieces(gamefile, piece);
	printbufferdataOnIndex(index);
}

/**
 * Utility function for printing the vertex data of the specific
 * piece index within the mesh data of the gamefile.
 * Call `printbufferdataOnCoords()` if you don't know the piece's index.
 * @param {gamefile} coords - The gamefile
 * @param {number[]} coords - The coordiantes of the piece
 */
function printbufferdataOnIndex(gamefile, index) {
	const stridePerPiece = gamefile.mesh.stride * POINTS_PER_SQUARE;
	const i = index * stridePerPiece;

	for (let a = 0; a < stridePerPiece; a++) {
		const thisIndex = i + a;
		console.log(gamefile.mesh.data32[thisIndex]);
	}
}

// Shifts every piece in the model to the nearest REGEN_RANGE. 

/**
 * Shifts the data linearly within the gamefile's mesh so that it's closer to the
 * origin, requiring less severe uniform translations upon rendering.
 * The amount it is shifted depends on the nearest `REGEN_RANGE`.
 * ~50% faster than using `regenPiecesModel()` to regenerate the entire mesh.
 * @param {gamefile} gamefile - The gamefile
 */
function shiftPiecesModel(gamefile) {
	console.log("Shifting pieces model..");
	frametracker.onVisualChange();

	// console.log('Begin shifting model..')

	const newOffset = math.roundPointToNearestGridpoint(movement.getBoardPos(), REGEN_RANGE);

	const diffXOffset = gamefile.mesh.offset[0] - newOffset[0];
	const diffYOffset = gamefile.mesh.offset[1] - newOffset[1];

	const chebyshevDistance = math.chebyshevDistance(gamefile.mesh.offset, newOffset);
	if (chebyshevDistance > DISTANCE_AT_WHICH_MESH_GLITCHES) {
		console.log(`REGENERATING the model instead of shifting. It was translated by ${chebyshevDistance} tiles!`);
		regenModel(gamefile, options.getPieceRegenColorArgs());
		return;
	}

	gamefile.mesh.offset = newOffset;

	// Also shift rotated model if its defined (in perspective mode)
	if (perspective.getEnabled()) shiftBothModels();
	else shiftMainModel();

	function shiftMainModel() {
		for (let i = 0; i < gamefile.mesh.data32.length; i += gamefile.mesh.stride) {
			gamefile.mesh.data64[i] += diffXOffset;
			gamefile.mesh.data64[i + 1] += diffYOffset;
			gamefile.mesh.data32[i] = gamefile.mesh.data64[i];
			gamefile.mesh.data32[i + 1] = gamefile.mesh.data64[i + 1];
		}

		// gamefile.mesh.model = gamefile.mesh.usingColoredTextures ? buffermodel.createModel_ColorTexture(gamefile.mesh.data32)
		gamefile.mesh.model = gamefile.mesh.usingColoredTextures ? buffermodel.createModel_ColorTextured(gamefile.mesh.data32, 2, "TRIANGLES", spritesheet.getSpritesheet())
            : buffermodel.createModel_Textured(gamefile.mesh.data32, 2, "TRIANGLES", spritesheet.getSpritesheet());
	}

	function shiftBothModels() {            
		for (let i = 0; i < gamefile.mesh.data32.length; i += gamefile.mesh.stride) { 
			gamefile.mesh.data64[i] += diffXOffset;
			gamefile.mesh.data64[i + 1] += diffYOffset;
			gamefile.mesh.data32[i] = gamefile.mesh.data64[i];
			gamefile.mesh.data32[i + 1] = gamefile.mesh.data64[i + 1];
			gamefile.mesh.rotatedData64[i] += diffXOffset;
			gamefile.mesh.rotatedData64[i + 1] += diffYOffset;
			gamefile.mesh.rotatedData32[i] = gamefile.mesh.rotatedData64[i];
			gamefile.mesh.rotatedData32[i + 1] = gamefile.mesh.rotatedData64[i + 1];
		}

		// gamefile.mesh.model = gamefile.mesh.usingColoredTextures ? buffermodel.createModel_ColorTexture(gamefile.mesh.data32)
		gamefile.mesh.model = gamefile.mesh.usingColoredTextures ? buffermodel.createModel_ColorTextured(gamefile.mesh.data32, 2, "TRIANGLES", spritesheet.getSpritesheet())
            : buffermodel.createModel_Textured(gamefile.mesh.data32, 2, "TRIANGLES", spritesheet.getSpritesheet());
		// gamefile.mesh.rotatedModel = gamefile.mesh.usingColoredTextures ? buffermodel.createModel_ColorTexture(gamefile.mesh.rotatedData32)
		gamefile.mesh.rotatedModel = gamefile.mesh.usingColoredTextures ? buffermodel.createModel_ColorTextured(gamefile.mesh.rotatedData32, 2, "TRIANGLES", spritesheet.getSpritesheet())
            : buffermodel.createModel_Textured(gamefile.mesh.rotatedData32, 2, "TRIANGLES", spritesheet.getSpritesheet());
	}

	voids.shiftModel(gamefile, diffXOffset, diffYOffset);
}

/**
 * Generates the rotated-180° mesh of the pieces used when perspective
 * mode is enabled and we view our opponent's perspective.
 * About same speed as `regenPiecesModel()`.
 * @param {gamefile} gamefile - The gamefile of which to regenerate the mesh of the pieces
 * @param {boolean} [ignoreGenerating] Optional. If true, the function will run regardless if the mesh is currently being calculated. This is useful to prevent running the function twice at the same time. Default: *false*
 */
async function initRotatedPiecesModel(gamefile, ignoreGenerating = false) {
	if (gamefile.mesh.model === undefined) return;
	if (gamefile.mesh.isGenerating && !ignoreGenerating) return;
	gamefile.mesh.locked++;
	gamefile.mesh.isGenerating++;

	console.log("Rotating pieces model..");
	frametracker.onVisualChange();

	// console.log('Begin rotating model..')

	// Amount to transition the points
	const weAreBlack = onlinegame.areInOnlineGame() && onlinegame.areWeColor("black");
	const spritesheetPieceWidth = spritesheet.getSpritesheetDataPieceWidth();
	const texWidth = weAreBlack ? -spritesheetPieceWidth : spritesheetPieceWidth;

	gamefile.mesh.rotatedData64 = new Float64Array(gamefile.mesh.data32.length); // Empty it for re-initialization
	gamefile.mesh.rotatedData32 = new Float32Array(gamefile.mesh.data32.length); // Empty it for re-initialization

	const stride = gamefile.mesh.stride; // 4 / 8
	const indicesPerPiece = stride * POINTS_PER_SQUARE; // 4|8 * 6
    
	const totalPieceCount = gamefileutility.getPieceCount_IncludingUndefineds(gamefile) * 2; // * 2 for the data32 and data64 arrays

	// How much time can we spend on this potentially long task?
	let pieceLimitToRecalcTime = 1000;
	let startTime = performance.now();
	let timeToStop = startTime + loadbalancer.getLongTaskTime();
	let piecesSinceLastCheck = 0;
	let piecesComplete = 0;

	stats.showRotateMesh();

	// With a stride length of 4, the order is: 2 vertex points, 2 texture points.
	// BUT, 6 points make up the square!
	const funcToUse = gamefile.mesh.usingColoredTextures ? rotateDataColorTexture : rotateDataTexture;
	await funcToUse(gamefile.mesh.data64, gamefile.mesh.rotatedData64);
	if (gamefile.mesh.terminate) {
		console.log("Mesh generation terminated.");
		stats.hideRotateMesh();
		if (!ignoreGenerating) gamefile.mesh.terminate = false;
		gamefile.mesh.locked--;
		gamefile.mesh.isGenerating--;
		return;
	}
	await funcToUse(gamefile.mesh.data32, gamefile.mesh.rotatedData32);
	if (gamefile.mesh.terminate) {
		console.log("Mesh generation terminated.");
		stats.hideRotateMesh();
		if (!ignoreGenerating) gamefile.mesh.terminate = false;
		gamefile.mesh.locked--;
		gamefile.mesh.isGenerating--;
		return;
	}

	async function rotateDataTexture(sourceArray, destArray) {
		for (let i = 0; i < gamefile.mesh.data32.length; i += indicesPerPiece) {
			// Point 1
			destArray[i] = sourceArray[i];
			destArray[i + 1] = sourceArray[i + 1];
			destArray[i + 2] = sourceArray[i + 2] + texWidth;
			destArray[i + 3] = sourceArray[i + 3] + texWidth;

			// Point 2
			destArray[i + 4] = sourceArray[i + 4];
			destArray[i + 5] = sourceArray[i + 5];
			destArray[i + 6] = sourceArray[i + 6] + texWidth;
			destArray[i + 7] = sourceArray[i + 7] - texWidth;

			// Point 3
			destArray[i + 8] = sourceArray[i + 8];
			destArray[i + 9] = sourceArray[i + 9];
			destArray[i + 10] = sourceArray[i + 10] - texWidth;
			destArray[i + 11] = sourceArray[i + 11] + texWidth;

			// Point 4
			destArray[i + 12] = sourceArray[i + 12];
			destArray[i + 13] = sourceArray[i + 13];
			destArray[i + 14] = sourceArray[i + 14] - texWidth;
			destArray[i + 15] = sourceArray[i + 15] + texWidth;

			// Point 5
			destArray[i + 16] = sourceArray[i + 16];
			destArray[i + 17] = sourceArray[i + 17];
			destArray[i + 18] = sourceArray[i + 18] + texWidth;
			destArray[i + 19] = sourceArray[i + 19] - texWidth;

			// Point 6
			destArray[i + 20] = sourceArray[i + 20];
			destArray[i + 21] = sourceArray[i + 21];
			destArray[i + 22] = sourceArray[i + 22] - texWidth;
			destArray[i + 23] = sourceArray[i + 23] - texWidth;

			// If we've spent too much time, sleep!
			piecesSinceLastCheck++;
			piecesComplete++;
			if (piecesSinceLastCheck >= pieceLimitToRecalcTime) {
				piecesSinceLastCheck = 0;
				await sleepIfUsedTooMuchTime();
				if (gamefile.mesh.terminate) return;
				if (loadbalancer.getForceCalc()) {
					pieceLimitToRecalcTime = Infinity;
					loadbalancer.setForceCalc(false);
				}
			}
		}
	}

	// This function will NOT be compatible for rotating color gradients!
	// I will have to rewrite a function then!
	async function rotateDataColorTexture(sourceArray, destArray) {
		for (let i = 0; i < gamefile.mesh.data32.length; i += indicesPerPiece) {
			// Point 1
			destArray[i] = sourceArray[i];
			destArray[i + 1] = sourceArray[i + 1];
			destArray[i + 2] = sourceArray[i + 2] + texWidth;
			destArray[i + 3] = sourceArray[i + 3] + texWidth;
			destArray[i + 4] = sourceArray[i + 4];
			destArray[i + 5] = sourceArray[i + 5];
			destArray[i + 6] = sourceArray[i + 6];
			destArray[i + 7] = sourceArray[i + 7];

			// Point 2
			destArray[i + 8] = sourceArray[i + 8];
			destArray[i + 9] = sourceArray[i + 9];
			destArray[i + 10] = sourceArray[i + 10] + texWidth;
			destArray[i + 11] = sourceArray[i + 11] - texWidth;
			destArray[i + 12] = sourceArray[i + 12];
			destArray[i + 13] = sourceArray[i + 13];
			destArray[i + 14] = sourceArray[i + 14];
			destArray[i + 15] = sourceArray[i + 15];

			// Point 3
			destArray[i + 16] = sourceArray[i + 16];
			destArray[i + 17] = sourceArray[i + 17];
			destArray[i + 18] = sourceArray[i + 18] - texWidth;
			destArray[i + 19] = sourceArray[i + 19] + texWidth;
			destArray[i + 20] = sourceArray[i + 20];
			destArray[i + 21] = sourceArray[i + 21];
			destArray[i + 22] = sourceArray[i + 22];
			destArray[i + 23] = sourceArray[i + 23];

			// Point 4
			destArray[i + 24] = sourceArray[i + 24];
			destArray[i + 25] = sourceArray[i + 25];
			destArray[i + 26] = sourceArray[i + 26] - texWidth;
			destArray[i + 27] = sourceArray[i + 27] + texWidth;
			destArray[i + 28] = sourceArray[i + 28];
			destArray[i + 29] = sourceArray[i + 29];
			destArray[i + 30] = sourceArray[i + 30];
			destArray[i + 31] = sourceArray[i + 31];

			// Point 5
			destArray[i + 32] = sourceArray[i + 32];
			destArray[i + 33] = sourceArray[i + 33];
			destArray[i + 34] = sourceArray[i + 34] + texWidth;
			destArray[i + 35] = sourceArray[i + 35] - texWidth;
			destArray[i + 36] = sourceArray[i + 36];
			destArray[i + 37] = sourceArray[i + 37];
			destArray[i + 38] = sourceArray[i + 38];
			destArray[i + 39] = sourceArray[i + 39];

			// Point 6
			destArray[i + 40] = sourceArray[i + 40];
			destArray[i + 41] = sourceArray[i + 41];
			destArray[i + 42] = sourceArray[i + 42] - texWidth;
			destArray[i + 43] = sourceArray[i + 43] - texWidth;
			destArray[i + 44] = sourceArray[i + 44];
			destArray[i + 45] = sourceArray[i + 45];
			destArray[i + 46] = sourceArray[i + 46];
			destArray[i + 47] = sourceArray[i + 47];

			// If we've spent too much time, sleep!
			piecesSinceLastCheck++;
			piecesComplete++;
			if (piecesSinceLastCheck >= pieceLimitToRecalcTime) {
				piecesSinceLastCheck = 0;
				await sleepIfUsedTooMuchTime();
				if (gamefile.mesh.terminate) return;
				if (loadbalancer.getForceCalc()) {
					pieceLimitToRecalcTime = Infinity;
					loadbalancer.setForceCalc(false);
				}
			}
		}
	}

	async function sleepIfUsedTooMuchTime() {

		if (!usedTooMuchTime()) return; // Keep processing...

		// console.log(`Too much! Sleeping.. Used ${performance.now() - startTime} of our allocated ${maxTimeToSpend}`)
		const percentComplete = piecesComplete / totalPieceCount;
		stats.updateRotateMesh(percentComplete);
		await thread.sleep(0);
		startTime = performance.now();
		timeToStop = startTime + loadbalancer.getLongTaskTime();
	}

	function usedTooMuchTime() {
		return performance.now() >= timeToStop;
	}

	stats.hideRotateMesh();

	// gamefile.mesh.rotatedModel = gamefile.mesh.usingColoredTextures ? buffermodel.createModel_ColorTexture(gamefile.mesh.rotatedData32)
	gamefile.mesh.rotatedModel = gamefile.mesh.usingColoredTextures ? buffermodel.createModel_ColorTextured(gamefile.mesh.rotatedData32, 2, "TRIANGLES", spritesheet.getSpritesheet())
        : buffermodel.createModel_Textured(gamefile.mesh.rotatedData32, 2, "TRIANGLES", spritesheet.getSpritesheet());

	gamefile.mesh.locked--;
	gamefile.mesh.isGenerating--;
	frametracker.onVisualChange();
}

/**
 * Erases the 180°-rotated mesh of the game. Call when exiting perspective mode.
 * @param {gamefile} gamefile - The gamefile
 */
function eraseRotatedModel(gamefile) {
	if (!gamefile) return; // Gamefile was unloaded before turning off perspective mode
	delete gamefile.mesh.rotatedData64;
	delete gamefile.mesh.rotatedData32;
	delete gamefile.mesh.rotatedModel;
}

export default {
	POINTS_PER_SQUARE,
	REGEN_RANGE,
	regenModel,
	movebufferdata,
	deletebufferdata,
	overwritebufferdata,
	printbufferdataOnCoords,
	printbufferdataOnIndex,
	shiftPiecesModel,
	initRotatedPiecesModel,
	eraseRotatedModel
};