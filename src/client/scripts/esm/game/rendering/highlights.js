
// Import Start
import perspective from './perspective.js';
import checkhighlight from './checkhighlight.js';
import arrows from './arrows.js';
import organizedlines from '../../chess/logic/organizedlines.js';
import movement from './movement.js';
import options from './options.js';
import selection from '../chess/selection.js';
import camera from './camera.js';
import board from './board.js';
import math from '../../util/math.js';
import movesscript from '../gui/movesscript.js';
import game from '../chess/game.js';
import buffermodel from './buffermodel.js';
import jsutil from '../../util/jsutil.js';
import coordutil from '../../chess/util/coordutil.js';
import frametracker from './frametracker.js';
import preferences from '../../components/header/preferences.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import legalmoveshapes from './legalmoveshapes.js';
import shapes from './shapes.js';
// Import End

/**
 * Type Definitions
 * @typedef {import('../../chess/logic/legalmoves.js').LegalMoves} LegalMoves
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 * @typedef {import('../../util/math.js').BoundingBox} BoundingBox
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
 */

"use strict";

/**
 * This script handles the rendering of legal moves,
 * and also highlights the last move played.
 */

const highlightedMovesRegenRange = 10_000; // Not every highlighted move can be calculated every frame because it's infinite. So we render them out to a specified distance. This is NOT that specified distance. This is the distance to at which to call the function to recalculate the model of the highlighted moves (the out-of-bounds)

/**
 * The board bounding box in which to render the legal move fields.
 * This dynamically grows and shrinks as you move around.
 * ALL legal move highlights, yours, your opponents,
 * even the ones when hovering over arrows, appear in here!
 * @type {BoundingBox}
 */
let boundingBoxOfRenderRange;
// Amount of screens in length to render highlighted squares, beyond the screen.
// This is useful because it means there's some cushioning when the user pans and
// zooms around that we don't instantly need to regenerate the model.
const multiplier = 4;
const multiplier_perspective = 2;

/** The buffer model of the legal move fields. @type {BufferModel} */
let model;
let model_Offset = [0,0]; // [x,y]

const z = -0.01;



(function init() {
	initLegalMoveShapeChangeEventListener();
})();

function initLegalMoveShapeChangeEventListener() {
	document.addEventListener('legalmove-shape-change', regenModel); // Custom Event listener when the setting is changed
}


function getOffset() {
	return model_Offset;
}

function render() {
	if (movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're zoomed out.

	highlightLastMove();
	checkhighlight.render();
	updateOffsetAndBoundingBoxOfRenderRange();
	renderLegalMoves();
	arrows.renderEachHoveredPiece();
	renderBoundingBoxOfRenderRange();
}

function renderLegalMoves() {
	if (!selection.isAPieceSelected()) return; // Only render if we have a highlighted squares model to use (will be undefined if none are highlighted)

	const boardPos = movement.getBoardPos();
	const position = [
        -boardPos[0] + model_Offset[0], // Add the model's offset
        -boardPos[1] + model_Offset[1],
        z
    ];
	const boardScale = movement.getBoardScale();
	const scale = [boardScale, boardScale, 1];
	model.render(position, scale);
}

// Regenerates the model for all highlighted squares. Expensive, minimize calling this.
function regenModel() {
	if (!selection.isAPieceSelected()) return;
	frametracker.onVisualChange();
	// console.log("Regenerating legal moves model..");

	/** The vertex data of our legal move fields. */
	const data = [];

	const gamefile = game.getGamefile();
	const coords = selection.getPieceSelected().coords;
	const legalMoves = selection.getLegalMovesOfSelectedPiece();
	const color = options.getLegalMoveHighlightColor(); // [r,g,b,a]
	let usingDots = preferences.getLegalMovesShape() === 'dots';

	// Potentially infinite data on sliding moves...
	// NEEDS TO BE FIRST BECAUSE IT CALLS updateOffsetAndBoundingBoxOfRenderRange() !!!!!
	concatData_HighlightedMoves_Sliding(data, coords, legalMoves, color, usingDots, gamefile);

	// Data of short range moves within 3 tiles
	concatData_HighlightedMoves_Individual(data, legalMoves, color, usingDots, gamefile);

	// 1 square data of our single selected piece
	usingDots = false;
	data.push(...getDataOfHighlightShapeDependingOnIfPieceOnSquare(coords, color, usingDots, gamefile));

	model = buffermodel.createModel_Colored(new Float32Array(data), 2, "TRIANGLES");
}

/**
 * Updates the offset and bounding box universal to all rendered legal move highlights.
 * If a change is made, it calls to regenerate the model.
 */
function updateOffsetAndBoundingBoxOfRenderRange() {
	let changeMade = false;

	const oldOffset = jsutil.deepCopyObject(model_Offset);
	// This is the range at which we will always regen this model. Prevents gittering.
	model_Offset = math.roundPointToNearestGridpoint(movement.getBoardPos(), highlightedMovesRegenRange);
	if (!coordutil.areCoordsEqual(oldOffset, model_Offset)) changeMade = true;

	// Used to limit the data/highlights of infinitely sliding moves to the area on your screen.
	if (isRenderRangeBoundingBoxOutOfRange()) {
		initBoundingBoxOfRenderRange();
		changeMade = true;
	}

	if (changeMade) {
		console.log("Shifted offset of highlights.");
		regenModel();
		arrows.regenModelsOfHoveredPieces();
	}
}

/**
 * Calculates buffer data of legal individual moves and appends it to the provided vertex data array.
 * @param {number[]} data - The vertex data array to apphend the new vertex data to
 * @param {LegalMoves} legalMoves 
 * @param {number[]} color 
 * @param {boolean} usingDots - Whether legal move are being rendered as dots and corner tri's. 
 * @param {gamefile} gamefile 
 */
function concatData_HighlightedMoves_Individual(data, legalMoves, color, usingDots, gamefile) {
	// Get an array of the list of individual legal squares the current selected piece can move to
	const theseLegalMoves = legalMoves.individual;

	// For each of these squares, calculate it's buffer data
	const length = !theseLegalMoves ? 0 : theseLegalMoves.length;
	for (let i = 0; i < length; i++) {
		data.push(...getDataOfHighlightShapeDependingOnIfPieceOnSquare(theseLegalMoves[i], color, usingDots, gamefile));
	}
}

function getDataOfHighlightShapeDependingOnIfPieceOnSquare(coord, color, usingDots, gamefile) {
	const offsetCoord = coordutil.subtractCoordinates(coord, model_Offset);
	return usingDots ? (() => {
		if (gamefileutility.isPieceOnCoords(gamefile, coord)) return legalmoveshapes.getDataLegalMoveCornerTris(offsetCoord, color);
		else return legalmoveshapes.getDataLegalMoveDot(offsetCoord, color);
	})() : shapes.getDataQuad_Color_FromCoord(offsetCoord, color);
}

// Processes current offset and render range to return the bounding box of the area we will be rendering highlights.
function initBoundingBoxOfRenderRange() {
	// console.log("Recalculating bounding box of render range.")

	const [ newWidth, newHeight ] = perspective.getEnabled() ? getDimensionsOfPerspectiveViewRange()
        : getDimensionsOfOrthographicViewRange();

	const halfNewWidth = newWidth / 2;
	const halfNewHeight = newHeight / 2;

	const boardPos = movement.getBoardPos();
	const newLeft = Math.ceil(boardPos[0] - halfNewWidth);
	const newRight = Math.floor(boardPos[0] + halfNewWidth);
	const newBottom = Math.ceil(boardPos[1] - halfNewHeight);
	const newTop = Math.floor(boardPos[1] + halfNewHeight);

	boundingBoxOfRenderRange = { 
		left: newLeft,
		right: newRight,
		bottom: newBottom,
		top: newTop
	};
}

function getDimensionsOfOrthographicViewRange() {
	// New improved method of calculating render bounding box

	// The center of the bounding box is our current boardPos
    
	const width = board.gboundingBox().right - board.gboundingBox().left + 1;
	const height = board.gboundingBox().top - board.gboundingBox().bottom + 1;

	let newWidth = width * multiplier;
	let newHeight = height * multiplier;

	// Make sure width has a cap so we aren't generating a model stupidly large
	// Cap width = width of screen in pixels, * multiplier
	const capWidth = camera.canvas.width * multiplier;
	if (newWidth > capWidth) {
		const ratio = capWidth / newWidth;
		newWidth *= ratio;
		newHeight *= ratio;
	}

	return [newWidth, newHeight];
}

function getDimensionsOfPerspectiveViewRange() {
	const width = perspective.viewRange * 2;
	const newWidth = width * multiplier_perspective;
	return [newWidth, newWidth];
}

function isRenderRangeBoundingBoxOutOfRange() {
	if (!boundingBoxOfRenderRange) return true; // It isn't even initiated yet 

	const boundingBoxOfView = perspective.getEnabled() ? getBoundingBoxOfPerspectiveView()
        : board.gboundingBox(false);

	// If our screen bounding box is less than 4x smaller than our render range bounding box,
	// we're wasting cpu, let's regenerate it.
	const width = boundingBoxOfView.right - boundingBoxOfView.left + 1;

	const renderRangeWidth = boundingBoxOfRenderRange.right - boundingBoxOfRenderRange.left + 1;

	// multiplier needs to be squared cause otherwise when we zoom in it regenerates the render box every frame.
	if (width * multiplier * multiplier < renderRangeWidth && !perspective.getEnabled()) return true;

	// If any edge of our screen bounding box is outside our render range bounding box, regenerate it.
	if (!math.boxContainsBox(boundingBoxOfRenderRange, boundingBoxOfView)) return true;

	return false;
}

function getBoundingBoxOfPerspectiveView() {

	const boardPos = movement.getBoardPos();
	const x = boardPos[0];
	const y = boardPos[1];

	const a = perspective.viewRange;

	const left = x - a;
	const right = x + a;
	const bottom = y - a;
	const top = y + a;

	return { left, right, bottom, top };
}

/**
 * Calculates buffer data of legal sliding moves and appends it to the provided vertex data array.
 * renderBoundingBox should always be greater than screen bounding box
 * @param {number[]} data - The vertex data array to apphend the new vertex data to
 * @param {number[]} coords - The coordinates of the piece with the provided legal moves
 * @param {LegalMoves} legalMoves 
 * @param {number[]} color 
 * @param {boolean} usingDots - Whether legal move are being rendered as dots and corner tri's.
 * @param {gamefile} gamefile 
 */
function concatData_HighlightedMoves_Sliding(data, coords, legalMoves, color, usingDots, gamefile) { // { left, right, bottom, top} The size of the box we should render within
	if (!legalMoves.sliding) return; // No sliding moves

	updateOffsetAndBoundingBoxOfRenderRange();

	const lineSet = new Set(Object.keys(legalMoves.sliding));

	const offsetCoord = coordutil.subtractCoordinates(coords, model_Offset);
	const vertexDataMove = usingDots ? legalmoveshapes.getDataLegalMoveDot(offsetCoord, color)
									: shapes.getDataQuad_Color_FromCoord(offsetCoord, color);
	const vertexDataCapture = usingDots ? legalmoveshapes.getDataLegalMoveCornerTris(offsetCoord, color) : undefined;

	for (const strline of lineSet) {
		const line = coordutil.getCoordsFromKey(strline); // [dx,dy]
		const C = organizedlines.getCFromLine(line, coords);

		const corner1 = math.getAABBCornerOfLine(line, true); // "right"
		const corner2 = math.getAABBCornerOfLine(line, false); // "bottomleft"
		const intsect1Tile = math.getLineIntersectionEntryTile(line[0], line[1], C, boundingBoxOfRenderRange, corner1);
		const intsect2Tile = math.getLineIntersectionEntryTile(line[0], line[1], C, boundingBoxOfRenderRange, corner2);

		if (!intsect1Tile && !intsect2Tile) continue; // If there's no intersection point, it's off the screen, don't bother rendering.
		if (!intsect1Tile || !intsect2Tile) { console.error(`Line only has one intersect with square.`); continue; }
        
		concatData_HighlightedMoves_Diagonal(data, coords, line, intsect1Tile, intsect2Tile, legalMoves.sliding[line], usingDots, vertexDataMove, vertexDataCapture, gamefile);
	}
}

/**
 * Adds the vertex of a directional movement line, in both directions, of ANY SLOPED step!
 * @param {number[]} data - The currently running vertex data array to apphend the new vertex data to
 * @param {number[]} coords - [x,y] of the piece
 * @param {number[]} step - Of the line / moveset
 * @param {number[]} intsect1Tile - What point this line intersect the left side of the screen box.
 * @param {number[]} intsect2Tile - What point this line intersect the right side of the screen box.
 * @param {number[]} limits - Slide limit: [-7,Infinity]
 * @param {boolean} usingDots - Whether legal move are being rendered as dots and corner tri's.
 * @param {number[]} vertexDataMove - The vertex data of a single legal move highlight (square or dot).
 * @param {number[]|undefined} [vertexDataCapture] The vertex data of a single legal move corner tri's (if usingDots).
 * @param {gamefile} gamefile 
 */
function concatData_HighlightedMoves_Diagonal(data, coords, step, intsect1Tile, intsect2Tile, limits, usingDots, vertexDataMove, vertexDataCapture, gamefile) {
	// Right moveset
	concatData_HighlightedMoves_Diagonal_Split(data, coords, step,    intsect1Tile, intsect2Tile, limits[1], 		   usingDots,  jsutil.deepCopyObject(vertexDataMove), jsutil.deepCopyObject(vertexDataCapture), gamefile);
    
	// Left moveset
	const negStep = [step[0] * -1, step[1] * -1];
	concatData_HighlightedMoves_Diagonal_Split(data, coords, negStep, intsect1Tile, intsect2Tile, Math.abs(limits[0]), usingDots, jsutil.deepCopyObject(vertexDataMove), jsutil.deepCopyObject(vertexDataCapture), gamefile);
}

/**
 * Adds the vertex of a single directional ray (split in 2 from a normal slide).
 * @param {number[]} data - The currently running vertex data array to apphend the new vertex data to
 * @param {number[]} coords - [x,y] of the piece
 * @param {number[]} step - Of the line / moveset. THIS NEEDS TO BE NEGATED if the ray is pointing to the left!!
 * @param {number[]} intsect1Tile - What point this line intersect the left side of the screen box.
 * @param {number[]} intsect2Tile - What point this line intersect the right side of the screen box.
 * @param {number} limit - Needs to be POSITIVE.
 * @param {boolean} usingDots - Whether legal move are being rendered as dots and corner tri's.
 * @param {number[]} vertexDataMove - The vertex data of a single legal move highlight (square or dot).
 * @param {number[]|undefined} [vertexDataCapture] The vertex data of a single legal move corner tri's (if usingDots).
 * @param {gamefile} gamefile 
 */
function concatData_HighlightedMoves_Diagonal_Split(data, coords, step, intsect1Tile, intsect2Tile, limit, usingDots, vertexDataMove, vertexDataCapture, gamefile) {
	if (limit === 0) return; // Quick exit

	const lineIsVertical = step[0] === 0;
	const index = lineIsVertical ? 1 : 0;
	const inverseIndex = 1 - index;

	const stepIsPositive = step[index] > 0;
	const entryIntsectTile = stepIsPositive ? intsect1Tile : intsect2Tile;
	const exitIntsectTile = stepIsPositive ? intsect2Tile : intsect1Tile;
    
	// Where the piece would land after 1 step
	let startCoords = [coords[0] + step[0], coords[1] + step[1]];
	// Is the piece 
	// Is the piece left, off-screen, of our intsect1Tile?
	if (stepIsPositive && startCoords[index] < entryIntsectTile[index] || !stepIsPositive && startCoords[index] > entryIntsectTile[index]) { // Modify the start square
		const distToEntryIntsectTile = entryIntsectTile[index] - startCoords[index]; // Can be negative
		const distInSteps = Math.ceil(distToEntryIntsectTile / step[index]); // Should always be positive
		const distRoundedUpToNearestStep = distInSteps * step[index]; // Can be negative
		const newStartXY = startCoords[index] + distRoundedUpToNearestStep;
		const yxToXStepRatio = step[inverseIndex] / step[index];
		const newStartYX = startCoords[inverseIndex] + distRoundedUpToNearestStep * yxToXStepRatio;
		startCoords = lineIsVertical ? [newStartYX, newStartXY] : [newStartXY, newStartYX];
	}

	let endCoords = exitIntsectTile;
	// Is the exitIntsectTile farther than we can legally slide?
	const xyWeShouldEnd = coords[index] + step[index] * limit;
	if (stepIsPositive && xyWeShouldEnd < endCoords[index] || !stepIsPositive && xyWeShouldEnd > endCoords[index]) {
		const yxWeShouldEnd = coords[inverseIndex] + step[inverseIndex] * limit;
		endCoords = lineIsVertical ? [yxWeShouldEnd, xyWeShouldEnd] : [xyWeShouldEnd, xyWeShouldEnd];
	}

	// Shift the vertex data of our first step to the right place
	const vertexDataXDiff = startCoords[0] - coords[0];
	const vertexDataYDiff = startCoords[1] - coords[1];
	shiftVertexData(vertexDataMove, vertexDataCapture, vertexDataXDiff, vertexDataYDiff); // The vertex data of the 1st step!

	// Calculate how many times we need to iteratively shift this vertex data and append it to our vertex data array
	const xyDist = stepIsPositive ? endCoords[index] - startCoords[index] : startCoords[index] - endCoords[index];
	if (xyDist < 0) return; // Early exit. The piece is up-right of our screen
	const iterationCount = Math.floor((xyDist + Math.abs(step[index])) / Math.abs(step[index])); // How many legal move square/dots to render on this line

	addDataDiagonalVariant(data, usingDots, vertexDataMove, vertexDataCapture, step, iterationCount, startCoords, gamefile);
}

/**
 * Accepts the vertex data of a legal move highlight (square/dot), and recursively
 * adds it to the vertex data list, shifting by the step size.
 * @param {number[]} data - The currently running vertex data array to apphend the new vertex data to
 * @param {boolean} usingDots - Whether legal move are being rendered as dots and corner tri's.
 * @param {number[]} vertexDataMove - The vertex data of a single legal move highlight (square or dot).
 * @param {number[]|undefined} [vertexDataCapture] The vertex data of a single legal move corner tri's (if usingDots).
 * @param {number[]} step - [dx,dy]
 * @param {number} iterateCount 
 */
function addDataDiagonalVariant(data, usingDots, vertexDataMove, vertexDataCapture, step, iterateCount, startCoords, gamefile) {
	if (usingDots) {
		for (let i = 0; i < iterateCount; i++) { 
			const thisCoord = [startCoords[0] + step[0] * i, startCoords[1] + step[1] * i];
			if (gamefileutility.isPieceOnCoords(gamefile, thisCoord)) data.push(...vertexDataCapture);
			else data.push(...vertexDataMove);
			
			shiftVertexData(vertexDataMove, vertexDataCapture, step[0], step[1]);
		}
	} else {
		for (let i = 0; i < iterateCount; i++) {
			data.push(...vertexDataMove);
			shiftVertexData(vertexDataMove, vertexDataCapture, step[0], step[1]);
		}
	}
}

/**
 * Shifts the provided vertex data for each vertex by the given X and Y offsets.
 * Stride 6 (2 vertex values, 4 color).
 * Shifts only the first (X) and second (Y) values in each stride.
 * @param {number[]} vertexDataMove - The vertex data of a single legal move highlight (square or dot).
 * @param {number[]|undefined} [vertexDataCapture] The vertex data of a single legal move corner tri's (if usingDots).
 * @param {number} x - The X offset to shift.
 * @param {number} y - The Y offset to shift.
 */
function shiftVertexData(dataMove, dataCapture, x, y) {
	const stride = 6; // 2 position values + 4 color values
	for (let i = 0; i < dataMove.length; i += stride) {
		dataMove[i] += x;     // Shift X value (first in the stride)
		dataMove[i + 1] += y; // Shift Y value (second in the stride)
	}
	if (dataCapture === undefined) return; // No capture data to shift
	for (let i = 0; i < dataCapture.length; i += stride) {
		dataCapture[i] += x;     // Shift X value (first in the stride)
		dataCapture[i + 1] += y; // Shift Y value (second in the stride)
	}
}

// Generates buffer model and renders the outline of the render range of our highlights, useful in developer mode.
function renderBoundingBoxOfRenderRange() {
	if (!options.isDebugModeOn()) return; // Skip if debug mode off

	const color = [1,0,1, 1];
	const data = shapes.getDataRect_FromTileBoundingBox(boundingBoxOfRenderRange, color);

	// const model = buffermodel.createModel_Color(new Float32Array(data));
	const model = buffermodel.createModel_Colored(new Float32Array(data), 2, "LINE_LOOP");

	model.render();
}

function highlightLastMove() {
	const lastMove = movesscript.getCurrentMove(game.getGamefile());
	if (!lastMove) return; // Don't render if last move is undefined.

	const color = options.getDefaultLastMoveHighlightColor();

	const data = [];

	data.push(...shapes.getTransformedDataQuad_Color3D_FromCoord(lastMove.startCoords, z, color));
	data.push(...shapes.getTransformedDataQuad_Color3D_FromCoord(lastMove.endCoords, z, color));

	const model = buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");

	model.render();
}

export default {
	getOffset,
	z,
	render,
	regenModel,
	concatData_HighlightedMoves_Individual,
	concatData_HighlightedMoves_Sliding
};