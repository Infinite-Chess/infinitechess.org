
/**
 * This script handles the rendering of legal moves
 * of both the selected piece, and of all piece's arrows
 * currently being hovered over.
 */

// @ts-ignore
import perspective from '../perspective.js';
// @ts-ignore
import arrows from '../arrows.js';
// @ts-ignore
import organizedlines from '../../../chess/logic/organizedlines.js';
// @ts-ignore
import movement from '../movement.js';
// @ts-ignore
import options from '../options.js';
// @ts-ignore
import camera from '../camera.js';
// @ts-ignore
import board from '../board.js';
// @ts-ignore
import math, { BoundingBox } from '../../../util/math.js';
// @ts-ignore
import frametracker from '../frametracker.js';
// @ts-ignore
import preferences from '../../../components/header/preferences.js';
// @ts-ignore
import gamefileutility from '../../../chess/util/gamefileutility.js';
// @ts-ignore
import legalmoveshapes from '../legalmoveshapes.js';
// @ts-ignore
import shapes from '../shapes.js';
import { BufferModel, BufferModelInstanced, createModel, createModel_Instanced } from '../buffermodel.js';
import coordutil from '../../../chess/util/coordutil.js';


// Type Definitions -----------------------------------------------------------------------------


// @ts-ignore
import type gamefile from '../../../chess/logic/gamefile.js';
// @ts-ignore
import type { LegalMoves } from '../../chess/selection.js';
// @ts-ignore
import type { Piece } from '../../../chess/logic/movepiece.js';
// @ts-ignore
import game from '../../chess/game.js';
import { Coords, CoordsKey } from '../../../chess/util/coordutil.js';
import { Color } from '../../../chess/util/colorutil.js';



// Variables -----------------------------------------------------------------------------


/**
 * An offset applied to the legal move highlights mesh, to keep all of the
 * vertex data less than this number.
 * 
 * The offset snaps to the nearest grid number of this size.
 * 
 * Without an offset, the vertex data has no imposed limit to how big the numbers can
 * get, which ends up creating graphical glitches MUCH SOONER, because the
 * GPU is only capable of Float32s, NOT Float64s (which javascript numbers are).
 * 
 * The legal move highlights offset will snap to this nearest number on the grid.
 * 
 * For example, if we're at position [8700,0] on the board, then the legal move highlight
 * offset will snap to [10000,0], making it so that the vertex data only needs to contain
 * numbers around 1300 instead of 8700 without an offset.
 * 
 * Using an offset means the vertex data ALWAYS remains less than 10000!
 */
const highlightedMovesRegenRange = 10_000;

/**
 * The current view box to generate visible legal moves inside.
 * 
 * We can only generate the mesh up to a finite distance.
 * This box dynamically grows, shrinks, and translates,
 * to ALWAYS keep the entire screen in the box.
 * 
 * By default it expands past the screen somewhat, so that a little
 * panning around doesn't immediately trigger this view box to change.
 */
let boundingBoxOfRenderRange: BoundingBox;
/** The distance, in perspective mode, we want to aim to render legal moves highlights out to, or farther. */
const PERSPECTIVE_VIEW_RANGE = 1000;
/** Amount of screens in number the render range bounding box should try to aim for beyond the screen. */
const multiplier = 4;
/**
 * In perspective mode, visible range is considered 1000. This is the multiplier to that for the render range bounding box.
 */
const multiplier_perspective = 2;



/** The current piece selected, if there is one. */
let pieceSelected: Piece | undefined;
/** The current selected piece's legal moves, if there is one. */
let selectedPieceLegalMoves: LegalMoves | undefined;
/** A normal buffer model that contains the highlight of the selected piece.
 * Does NOT use instanced rendering. */
let model_SelectedPiece: BufferModel | undefined;
/** An model using instanced-rendering for rendering the non-capturing legal move highlights */
let model_NonCapture: BufferModelInstanced | undefined;
/** An model using instanced-rendering for rendering the capturing legal move highlights */
let model_Capture: BufferModelInstanced | undefined;
/**
 * How much the vertex data of the highlight models has been offset, to make their numbers
 * close to zero, to avoid floating point imprecision.
 * 
 * This is the nearest multiple of {@link highlightedMovesRegenRange} our camera is at.
 */
let model_Offset: Coords = [0,0]; // [x,y]


// Functions -------------------------------------------------------------------------------------


(function init() {
	// When the legal move shape settings is modified, regenerate the model of the highlights
	document.addEventListener('legalmove-shape-change', regenerateAll); // Custom Event

	// When the theme is changed, erase the models so they
	// will be regenerated next render call.
	document.addEventListener('theme-change', regenerateAll);
})();



/** Returns {@link model_Offset} */
function getOffset() {
	return model_Offset;
}

function isPieceSelected() {
	return pieceSelected !== undefined;
}

/** Call this from selection.js when a piece is selected */
function onPieceSelected(piece: Piece, legalMoves: LegalMoves) {
	pieceSelected = piece;
	selectedPieceLegalMoves = legalMoves;
	regenSelectedPieceLegalMovesHighlightsModel();
}

function onPieceUnselected() {
	pieceSelected = undefined;
	selectedPieceLegalMoves = undefined;
	eraseModels();
}

function eraseModels() {
	model_SelectedPiece = undefined;
	model_NonCapture = undefined;
	model_Capture = undefined;
}



/**
 * Renders the legal move highlights of the selected piece, all hovered arrows,
 * and outlines the box containing all of them.
 */
function render() {
	// Sometimes when we are just panning around, our screen bounding box
	// exits the box containing our generating legal move highlights mesh.
	// When that happens, update the box and regenerate the highlights!
	updateOffsetAndBoundingBoxOfRenderRange();

	renderSelectedPiecesLegalMoves();
	arrows.renderEachHoveredPieceLegalMoves();
	renderOutlineofRenderBox();
}

/**
 * Updates the offset and bounding box universal to all rendered legal move highlights.
 * If a change is made, it calls to regenerate the model.
 */
function updateOffsetAndBoundingBoxOfRenderRange() {
	let changeMade = false;

	// const oldOffset = jsutil.deepCopyObject(model_Offset);
	// // This is the range at which we will always regen this model. Prevents gittering.
	// model_Offset = math.roundPointToNearestGridpoint(movement.getBoardPos(), highlightedMovesRegenRange);
	// if (!coordutil.areCoordsEqual(oldOffset, model_Offset)) changeMade = true;

	// Used to limit the data/highlights of infinitely sliding moves to the area on your screen.
	if (isRenderRangeBoundingBoxOutOfRange()) {
		initBoundingBoxOfRenderRange(); // Updates it
		changeMade = true;
	}

	if (changeMade) {
		// console.log("Shifted offset of highlights.");
		/** Update our offset to the nearest grid-point multiple of {@link highlightedMovesRegenRange} */
		model_Offset = math.roundPointToNearestGridpoint(movement.getBoardPos(), highlightedMovesRegenRange);
		regenerateAll();
	}
}

/**
 * Returns true if the current screen's view box exceeds the box
 * of our current legal move highlights mesh,
 * OR if it is massively smaller than it.
 */
function isRenderRangeBoundingBoxOutOfRange() {
	if (!boundingBoxOfRenderRange) return true; // It isn't even initiated yet 

	// The bounding box of what the camera currently sees on-screen.
	const boundingBoxOfView = perspective.getEnabled() ? getBoundingBoxOfPerspectiveView()
       												   : board.gboundingBox(false);

	// If our screen bounding box is less than 4x smaller than our render range bounding box,
	// we're wasting cpu, let's regenerate it.

	const width = boundingBoxOfView.right - boundingBoxOfView.left + 1;
	const renderRangeWidth = boundingBoxOfRenderRange.right - boundingBoxOfRenderRange.left + 1;
	// multiplier needs to be squared cause otherwise when we zoom in it regenerates the render box every frame.
	if (width * multiplier * multiplier < renderRangeWidth && !perspective.getEnabled()) return true;

	// If any edge of our screen bounding box is outside our render range bounding box, regenerate it.
	return !math.boxContainsBox(boundingBoxOfRenderRange, boundingBoxOfView);
}

function getBoundingBoxOfPerspectiveView() {

	const boardPos = movement.getBoardPos();
	const x = boardPos[0];
	const y = boardPos[1];

	const a = PERSPECTIVE_VIEW_RANGE;

	const left = x - a;
	const right = x + a;
	const bottom = y - a;
	const top = y + a;

	return { left, right, bottom, top };
}

/**
 * Updates the edges of the bounding box containing all our rendered legal
 * move highlights to be approximately {@link multiplier} times past the
 * edge of the screen, so there is some cushion with panning around
 * so we don't have to recalculate the highlights mesh every single frame.
 */
function initBoundingBoxOfRenderRange() {
	// console.log("Recalculating bounding box of render range.");

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

/**
 * Returns the target dimensions of the legal move highlights box.
 */
function getDimensionsOfOrthographicViewRange(): Coords {
	// New improved method of calculating render bounding box

	const boardBoundingBox = board.gboundingBox();
	const width = boardBoundingBox.right - boardBoundingBox.left + 1;
	const height = boardBoundingBox.top - boardBoundingBox.bottom + 1;

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

/**
 * Returns the target dimensions of the legal move highlights box
 * FOR PERSPECTIVE MODE
 */
function getDimensionsOfPerspectiveViewRange(): Coords {
	const width = PERSPECTIVE_VIEW_RANGE * 2;
	const newWidth = width * multiplier_perspective;
	return [newWidth, newWidth];
}

/**
 * Regenerates both the models of our selected piece's legal move highlights,
 * and the models of pieces legal moves of which we're currently hovering over their arrow.
 */
function regenerateAll() {
	regenSelectedPieceLegalMovesHighlightsModel();
	arrows.regenModelsOfHoveredPieces();

	frametracker.onVisualChange();
}

// Regenerates the model for all highlighted legal moves.
function regenSelectedPieceLegalMovesHighlightsModel() {
	if (!isPieceSelected()) return;
	// console.log("Regenerating legal moves model..");

	// The model of the selected piece's legal moves
	const color = options.getLegalMoveHighlightColor(); // [r,g,b,a]
	const { NonCaptureModel, CaptureModel } = generateModelsForPiecesLegalMoveHighlights(pieceSelected!.coords, selectedPieceLegalMoves!, color);
	model_NonCapture = NonCaptureModel;
	model_Capture = CaptureModel;
	
	// The selected piece highlight model
	const coords = pieceSelected!.coords;
	const offsetCoord = coordutil.subtractCoordinates(coords, model_Offset);
	const dataSelectedPieceHighlight = shapes.getDataQuad_Color_FromCoord(offsetCoord, color);
	model_SelectedPiece = createModel(dataSelectedPieceHighlight, 2, "TRIANGLES", true);
}

/**
 * Generates the renderable instanced rendering buffer models for the
 * legal move highlights of the given piece's legal moves.
 * @param coords - The coordinates of the piece with the provided legal moves
 * @param legalMoves - The legal moves of which to generate the highlights models for.
 * @param color - The color to use, which may vary depending on if the highlights are for your piece, opponent's, or a premove.
 */
function generateModelsForPiecesLegalMoveHighlights(coords: Coords, legalMoves: LegalMoves, color: Color): { NonCaptureModel: BufferModelInstanced, CaptureModel: BufferModelInstanced } {
	const usingDots = preferences.getLegalMovesShape() === 'dots';

	/** The vertex data OF A SINGLE INSTANCE of the NON-CAPTURING legal move highlight. Stride 6 (2 position, 4 color) */
	const vertexData_NonCapture: number[] = usingDots ? legalmoveshapes.getDataLegalMoveDot(color) : legalmoveshapes.getDataLegalMoveSquare(color);
	/** The instance-specific data of the NON-CAPTURING legal move highlights mesh. Stride 2 (2 instanceposition) */
	const instanceData_NonCapture: number[] = [];
	/** The vertex data OF A SINGLE INSTANCE of the CAPTURING legal move highlight. Stride 6 (2 position, 4 color) */
	const vertexData_Capture: number[] = usingDots ? legalmoveshapes.getDataLegalMoveCornerTris(color) : legalmoveshapes.getDataLegalMoveSquare(color);
	/** The instance-specific data of the CAPTURING legal move highlights mesh. Stride 2 (2 instanceposition) */
	const instanceData_Capture: number[] = [];

	const gamefile = game.getGamefile();

	// Data of short range moves within 3 tiles
	concatData_HighlightedMoves_Individual(instanceData_NonCapture, instanceData_Capture, legalMoves!, gamefile);
	// Potentially infinite data on sliding moves...
	concatData_HighlightedMoves_Sliding(instanceData_NonCapture, instanceData_Capture, coords, legalMoves!, gamefile);

	return {
		// The NON-CAPTURING legal move highlights model
		NonCaptureModel: createModel_Instanced(vertexData_NonCapture, instanceData_NonCapture, "TRIANGLES", true),
		// The CAPTURING legal move highlights model
		CaptureModel: createModel_Instanced(vertexData_Capture, instanceData_Capture, "TRIANGLES", true),
	};
}

/**
 * Renders the current selected piece's legal move mesh,
 * IF a piece is selected.
 * 
 * The mesh should have been pre-calculated.
 */
function renderSelectedPiecesLegalMoves() {
	if (!isPieceSelected()) return; // No model to render

	const boardPos: Coords = movement.getBoardPos();
	const position: [number,number,number] = [
        -boardPos[0] + model_Offset[0], // Add the model's offset
        -boardPos[1] + model_Offset[1],
        0
    ];
	const boardScale: number = movement.getBoardScale();
	const scale: [number,number,number] = [boardScale, boardScale, 1];
	
	// Render each of the models using instanced rendering.
	model_SelectedPiece!.render(position, scale);
	model_NonCapture!.render(position, scale);
	model_Capture!.render(position, scale);
}

/**
 * Calculates instanceposition data of legal individual (jumping) moves and appends it to the provided instance data arrays.
 * @param instanceData_NonCapture - The running array of instance data for the NON-CAPTURING legal moves highlights mesh.
 * @param instanceData_Capture - The running array of instance data for the CAPTURING legal moves highlights mesh.
 * @param legalMoves - The piece legal moves to highlight
 * @param gamefile - A reference to the current loaded gamefile
 */
function concatData_HighlightedMoves_Individual(instanceData_NonCapture: number[], instanceData_Capture: number[], legalMoves: LegalMoves, gamefile: gamefile) {
	// Get an array of the list of individual legal squares the current selected piece can move to
	const legalIndividuals: Coords[] = legalMoves.individual;
	if (!legalIndividuals) return; // This piece doesn't have any legal jumping/individual moves.

	// For each of these squares, calculate it's buffer data
	for (const coord of legalIndividuals) {
		const isPieceOnCoords = gamefileutility.isPieceOnCoords(gamefile, coord);
		const offsetCoord = coordutil.subtractCoordinates(coord, model_Offset);
		if (isPieceOnCoords) instanceData_Capture.push(...offsetCoord);
		else instanceData_NonCapture.push(...offsetCoord);
	}
}

/**
 * Calculates instanceposition data of legal sliding moves and appends it to the running instance data arrays.
 * @param instanceData_NonCapture - The running array of instance data for the NON-CAPTURING legal moves highlights mesh.
 * @param instanceData_Capture - The running array of instance data for the CAPTURING legal moves highlights mesh.
 * @param coords - The coords of the piece with the provided legal moves
 * @param legalMoves - The piece legal moves to highlight
 * @param gamefile - A reference to the current loaded gamefile
 */
function concatData_HighlightedMoves_Sliding(instanceData_NonCapture: number[], instanceData_Capture: number[], coords: Coords, legalMoves: LegalMoves, gamefile: gamefile) { // { left, right, bottom, top} The size of the box we should render within
	if (!legalMoves.sliding) return; // No sliding moves

	const slideLines = Object.keys(legalMoves.sliding); // ['1,0','1,1', ...]

	for (const lineKey of slideLines) { // '1,0'
		const line: Coords = coordutil.getCoordsFromKey(lineKey as CoordsKey); // [dx,dy]
		const C = organizedlines.getCFromLine(line, coords);

		const corner1 = math.getAABBCornerOfLine(line, true); // "right"
		const corner2 = math.getAABBCornerOfLine(line, false); // "bottomleft"
		const intsect1Tile = math.getLineIntersectionEntryTile(line[0], line[1], C, boundingBoxOfRenderRange, corner1);
		const intsect2Tile = math.getLineIntersectionEntryTile(line[0], line[1], C, boundingBoxOfRenderRange, corner2);

		if (!intsect1Tile && !intsect2Tile) continue; // If there's no intersection point, it's off the screen, don't bother rendering.
		if (!intsect1Tile || !intsect2Tile) throw Error(`Line only has one intersect with square.`);
        
		concatData_HighlightedMoves_Diagonal(instanceData_NonCapture, instanceData_Capture, coords, line, intsect1Tile, intsect2Tile, legalMoves.sliding[lineKey], gamefile);
	}
}

/**
 * Adds the instanceposition data of a directional movement line, in both directions, of ANY SLOPED step to the running instance data arrays.
 * @param instanceData_NonCapture - The running array of instance data for the NON-CAPTURING legal moves highlights mesh.
 * @param instanceData_Capture - The running array of instance data for the CAPTURING legal moves highlights mesh.
 * @param coords - The coords of the piece with the provided legal moves
 * @param step - Of the line / moveset
 * @param intsect1Tile - What point this line intersect the left side of the screen box.
 * @param intsect2Tile - What point this line intersect the right side of the screen box.
 * @param limits - Slide limit: [-7,Infinity]
 * @param gamefile - A reference to the current loaded gamefile
 */
function concatData_HighlightedMoves_Diagonal(instanceData_NonCapture: number[], instanceData_Capture: number[], coords: Coords, step: Coords, intsect1Tile: Coords, intsect2Tile: Coords, limits: Coords, gamefile: gamefile) {
	// Right moveset
	concatData_HighlightedMoves_Diagonal_Split(instanceData_NonCapture, instanceData_Capture, coords, step,    intsect1Tile, intsect2Tile, limits[1], 		    gamefile);
    
	// Left moveset
	const negStep: Coords = [step[0] * -1, step[1] * -1];
	concatData_HighlightedMoves_Diagonal_Split(instanceData_NonCapture, instanceData_Capture, coords, negStep, intsect1Tile, intsect2Tile, Math.abs(limits[0]), gamefile);
}

/**
 * Adds the instanceposition data of a single directional ray (split in 2 from a normal slide) to the running instance data arrays.
 * @param instanceData_NonCapture - The running array of instance data for the NON-CAPTURING legal moves highlights mesh.
 * @param instanceData_Capture - The running array of instance data for the CAPTURING legal moves highlights mesh.
 * @param coords - The coords of the piece with the provided legal moves
 * @param step - Of the line / moveset
 * @param intsect1Tile - What point this line intersect the left side of the screen box.
 * @param intsect2Tile - What point this line intersect the right side of the screen box.
 * @param limit - Needs to be POSITIVE.
 * @param gamefile - A reference to the current loaded gamefile
 */
function concatData_HighlightedMoves_Diagonal_Split(instanceData_NonCapture: number[], instanceData_Capture: number[], coords: Coords, step: Coords, intsect1Tile: Coords, intsect2Tile: Coords, limit: number, gamefile: gamefile) {
	if (limit === 0) return; // Quick exit

	const lineIsVertical = step[0] === 0;
	const index: 0 | 1 = lineIsVertical ? 1 : 0;
	// @ts-ignore
	const inverseIndex: 0 | 1 = 1 - index;

	const stepIsPositive = step[index] > 0;
	const entryIntsectTile = stepIsPositive ? intsect1Tile : intsect2Tile;
	const exitIntsectTile = stepIsPositive ? intsect2Tile : intsect1Tile;
    
	// Where the piece would land after 1 step
	let startCoords: Coords = [coords[0] + step[0], coords[1] + step[1]];
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
	const firstInstancePositionOffset: Coords = coordutil.subtractCoordinates(startCoords, model_Offset);

	// Calculate how many times we need to iteratively shift this vertex data and append it to our vertex data array
	const xyDist = stepIsPositive ? endCoords[index] - startCoords[index] : startCoords[index] - endCoords[index];
	if (xyDist < 0) return; // Early exit. The piece is up-right of our screen
	const iterationCount = Math.floor((xyDist + Math.abs(step[index])) / Math.abs(step[index])); // How many legal move square/dots to render on this line

	addDataDiagonalVariant(instanceData_NonCapture, instanceData_Capture, firstInstancePositionOffset, step, iterationCount, startCoords, gamefile);
}

/**
 * Accepts the vertex data of a legal move highlight (square/dot), and recursively
 * adds it to the vertex data list, shifting by the step size.
 * @param instanceData_NonCapture - The running array of instance data for the NON-CAPTURING legal moves highlights mesh.
 * @param instanceData_Capture - The running array of instance data for the CAPTURING legal moves highlights mesh.
 * @param firstInstancePositionOffset - The instance position offset of the first point on this line.
 * @param step - Of the line / moveset
 * @param iterateCount - How many times to shift the {@link firstInstancePositionOffset} by the {@link step}, adding each iteration as another instance of the legal move highlight.
 * @param startCoords - The start coordiantes of the first legal move highlight instance
 * @param gamefile - A reference to the current loaded gamefile
 */
function addDataDiagonalVariant(instanceData_NonCapture: number[], instanceData_Capture: number[], firstInstancePositionOffset: Coords, step: Coords, iterateCount: number, startCoords: Coords, gamefile: gamefile) {
	for (let i = 0; i < iterateCount; i++) { 
		const thisCoord = [startCoords[0] + step[0] * i, startCoords[1] + step[1] * i];
		const isPieceOnCoords = gamefileutility.isPieceOnCoords(gamefile, thisCoord);
		if (isPieceOnCoords) instanceData_Capture.push(   ...firstInstancePositionOffset);
		else 				 instanceData_NonCapture.push(...firstInstancePositionOffset);
		firstInstancePositionOffset[0] += step[0];
		firstInstancePositionOffset[1] += step[1];
	}
}

/**
 * Renders an outline of the box containing all legal move highlights.
 */
function renderOutlineofRenderBox() {
	if (!options.isDebugModeOn()) return; // Skip if debug mode off

	const color = [1,0,1, 1];
	const data = shapes.getDataRect_FromTileBoundingBox(boundingBoxOfRenderRange, color);

	const model = createModel(data, 2, "LINE_LOOP", true);
	model.render();
}

export default {
	render,
	getOffset,
	onPieceSelected,
	onPieceUnselected,
	generateModelsForPiecesLegalMoveHighlights,
};