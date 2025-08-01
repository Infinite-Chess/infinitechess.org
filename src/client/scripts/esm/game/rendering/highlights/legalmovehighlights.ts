
/**
 * [ZOOMED IN] This script handles the rendering of legal moves
 * of both the selected piece, and of all piece's arrows
 * currently being hovered over.
 */

import coordutil from '../../../chess/util/coordutil.js';
import gameslot from '../../chess/gameslot.js';
import arrowlegalmovehighlights from '../arrows/arrowlegalmovehighlights.js';
import specialrighthighlights from './specialrighthighlights.js';
import selection from '../../chess/selection.js';
import boardutil from '../../../chess/util/boardutil.js';
import frametracker from '../frametracker.js';
import preferences from '../../../components/header/preferences.js';
import typeutil from '../../../chess/util/typeutil.js';
import checkresolver from '../../../chess/logic/checkresolver.js';
import boardpos from '../boardpos.js';
import geometry, { IntersectionPoint } from '../../../util/math/geometry.js';
import boardtiles from '../boardtiles.js';
import piecemodels from '../piecemodels.js';
import legalmoveshapes from '../instancedshapes.js';
import bounds, { BoundingBoxBD } from '../../../util/math/bounds.js';
import bd, { BigDecimal } from '../../../util/bigdecimal/bigdecimal.js';
import { BufferModel, BufferModelInstanced, createModel, createModel_Instanced } from '../buffermodel.js';
// @ts-ignore
import perspective from '../perspective.js';
// @ts-ignore
import camera from '../camera.js';
// @ts-ignore
import shapes from '../shapes.js';


// Type Definitions -----------------------------------------------------------------------------

import type { Player } from '../../../chess/util/typeutil.js';
import type { Color } from '../../../util/math/math.js';
import type { BDCoords, Coords, CoordsKey, DoubleCoords } from '../../../chess/util/coordutil.js';
import type { IgnoreFunction } from '../../../chess/logic/movesets.js';
import type { Piece } from '../../../chess/util/boardutil.js';
import type { MoveDraft } from '../../../chess/logic/movepiece.js';
import type { LegalMoves, SlideLimits } from '../../../chess/logic/legalmoves.js';
import type { Board, FullGame } from '../../../chess/logic/gamefile.js';
import type { Ray, Vec2, Vec3 } from '../../../util/math/vectors.js';



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
const highlightedMovesRegenRange = 10_000n;

/**
 * The current view box to generate visible legal moves inside.
 * 
 * We can only generate the mesh up to a finite distance.
 * This box dynamically grows, shrinks, and translates,
 * to ALWAYS keep the entire screen in the box.
 * 
 * By default it expands past the screen somewhat, so that a little
 * panning around doesn't immediately trigger this view box to change.
 * 
 * THIS IS ROUNDED AWAY TO NEXT INTEGER
 */
let boundingBoxOfRenderRange: BoundingBoxBD;
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
let model_Offset: Coords = [0n,0n]; // [x,y]


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
	arrowlegalmovehighlights.renderEachHoveredPieceLegalMoves();
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
	// model_Offset = geometry.roundPointToNearestGridpoint(boardpos.getBoardPos(), highlightedMovesRegenRange);
	// if (!coordutil.areCoordsEqual(oldOffset, model_Offset)) changeMade = true;

	// Used to limit the data/highlights of infinitely sliding moves to the area on your screen.
	if (isRenderRangeBoundingBoxOutOfRange()) {
		initBoundingBoxOfRenderRange(); // Updates it
		changeMade = true;
	}

	if (changeMade) {
		// console.log("Shifted offset of highlights.");
		/** Update our offset to the nearest grid-point multiple of {@link highlightedMovesRegenRange} */
		model_Offset = geometry.roundPointToNearestGridpoint(boardpos.getBoardPos(), highlightedMovesRegenRange);
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
	const boundingBoxOfView: BoundingBoxBD = perspective.getEnabled() ? getBoundingBoxOfPerspectiveView()
       																  : boardtiles.gboundingBox(false);
	console.log("Is screen view box accurate? ", boundingBoxOfView);

	// If our screen bounding box is less than 4x smaller than our render range bounding box,
	// we're wasting cpu, let's regenerate it.

	// We can cast to number since we're confident it's going to be small (we are zoomed in)
	const width: number = bd.toNumber(bd.subtract(boundingBoxOfView.right, boundingBoxOfView.left));
	const renderRangeWidth: number = bd.toNumber(bd.subtract(boundingBoxOfRenderRange.right, boundingBoxOfRenderRange.left)) + 1;

	// multiplier needs to be squared cause otherwise when we zoom in it regenerates the render box every frame.
	if (!perspective.getEnabled() && (width * multiplier * multiplier < renderRangeWidth)) return true;

	// If any edge of our screen bounding box is outside our render range bounding box, regenerate it.
	return !bounds.boxContainsBox(boundingBoxOfRenderRange, boundingBoxOfView);
}

function getBoundingBoxOfPerspectiveView(): BoundingBoxBD {

	const boardPos = boardpos.getBoardPos();

	const a: BigDecimal = bd.FromNumber(PERSPECTIVE_VIEW_RANGE);

	return {
		left: bd.subtract(boardPos[0], a),
		right: bd.add(boardPos[0], a),
		bottom: bd.subtract(boardPos[1], a),
		top: bd.add(boardPos[1], a)
	};
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

	const halfNewWidth: BigDecimal = bd.FromNumber(newWidth / 2);
	const halfNewHeight: BigDecimal = bd.FromNumber(newHeight / 2);

	const boardPos = boardpos.getBoardPos();

	boundingBoxOfRenderRange = {
		left: bd.ceil(bd.subtract(boardPos[0], halfNewWidth)),
		right: bd.floor(bd.add(boardPos[0], halfNewWidth)),
		bottom: bd.ceil(bd.subtract(boardPos[1], halfNewHeight)),
		top: bd.floor(bd.add(boardPos[1], halfNewHeight))
	};
}

/**
 * Returns the target dimensions of the legal move highlights box.
 */
function getDimensionsOfOrthographicViewRange(): DoubleCoords {
	// New improved method of calculating render bounding box

	const boardBoundingBox = boardtiles.gboundingBox();
	const width: number = bd.toNumber(bd.subtract(boardBoundingBox.right, boardBoundingBox.left));
	const height: number = bd.toNumber(bd.subtract(boardBoundingBox.top, boardBoundingBox.bottom));
	console.log("Does this need +1? width of board bounding box: ", width);

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
function getDimensionsOfPerspectiveViewRange(): DoubleCoords {
	const width = PERSPECTIVE_VIEW_RANGE * 2;
	const newWidth = width * multiplier_perspective;
	return [newWidth, newWidth];
}

/**
 * Regenerates both the models of our selected piece's legal move highlights,
 * and the models of pieces legal moves of which we're currently hovering over their arrow,
 * and the model of the special rights highlights.
 * 
 * Basically everything that relies on {@link model_Offset}
 */
function regenerateAll() {
	regenSelectedPieceLegalMovesHighlightsModel();
	arrowlegalmovehighlights.regenModelsOfHoveredPieces();
	specialrighthighlights.regenModel();

	frametracker.onVisualChange();
}

// Regenerates the model for all highlighted legal moves.
function regenSelectedPieceLegalMovesHighlightsModel() {
	if (!pieceSelected) return;
	// console.log("Regenerating legal moves model..");

	// The model of the selected piece's legal moves
	const selectedPieceColor = typeutil.getColorFromType(pieceSelected!.type);
	const color_options = { isOpponentPiece: selection.isOpponentPieceSelected(), isPremove: selection.arePremoving() };
	const color = preferences.getLegalMoveHighlightColor(color_options); // [r,g,b,a]
	const { NonCaptureModel, CaptureModel } = generateModelsForPiecesLegalMoveHighlights(pieceSelected!.coords, selectedPieceLegalMoves!, selectedPieceColor, color);
	model_NonCapture = NonCaptureModel;
	model_Capture = CaptureModel;
	
	// The selected piece highlight model
	const coords = pieceSelected!.coords;
	const offsetCoord = coordutil.subtractCoords(coords, model_Offset);
	const dataSelectedPieceHighlight = shapes.getDataQuad_Color_FromCoord(offsetCoord, color);
	model_SelectedPiece = createModel(dataSelectedPieceHighlight, 2, "TRIANGLES", true);
	
	frametracker.onVisualChange();
}

/**
 * Generates the renderable instanced rendering buffer models for the
 * legal move highlights of the given piece's legal moves.
 * @param coords - The coordinates of the piece with the provided legal moves
 * @param legalMoves - The legal moves of which to generate the highlights models for.
 * @param friendlyColor - The color of friendly pieces
 * @param highlightColor - The color to use, which may vary depending on if the highlights are for your piece, opponent's, or a premove.
 */
function generateModelsForPiecesLegalMoveHighlights(coords: Coords, legalMoves: LegalMoves, friendlyColor: Player, highlightColor: Color): { NonCaptureModel: BufferModelInstanced, CaptureModel: BufferModelInstanced } {
	const usingDots = preferences.getLegalMovesShape() === 'dots';

	/** The vertex data OF A SINGLE INSTANCE of the NON-CAPTURING legal move highlight. Stride 6 (2 position, 4 color) */
	const vertexData_NonCapture: number[] = usingDots ? legalmoveshapes.getDataLegalMoveDot(highlightColor) : legalmoveshapes.getDataLegalMoveSquare(highlightColor);
	/** The instance-specific data of the NON-CAPTURING legal move highlights mesh. Stride 2 (2 instanceposition) */
	const instanceData_NonCapture: bigint[] = [];
	/** The vertex data OF A SINGLE INSTANCE of the CAPTURING legal move highlight. Stride 6 (2 position, 4 color) */
	const vertexData_Capture: number[] = usingDots ? legalmoveshapes.getDataLegalMoveCornerTris(highlightColor) : legalmoveshapes.getDataLegalMoveSquare(highlightColor);
	/** The instance-specific data of the CAPTURING legal move highlights mesh. Stride 2 (2 instanceposition) */
	const instanceData_Capture: bigint[] = [];

	const gamefile = gameslot.getGamefile()!;

	// Data of short range moves within 3 tiles
	concatData_HighlightedMoves_Individual(instanceData_NonCapture, instanceData_Capture, legalMoves!, gamefile.boardsim);
	// Potentially infinite data on sliding moves...
	concatData_HighlightedMoves_Sliding(instanceData_NonCapture, instanceData_Capture, coords, legalMoves!, gamefile, friendlyColor);

	return {
		// The NON-CAPTURING legal move highlights model
		NonCaptureModel: createModel_Instanced(vertexData_NonCapture, piecemodels.castBigIntArrayToFloat32(instanceData_NonCapture), "TRIANGLES", true),
		// The CAPTURING legal move highlights model
		CaptureModel: createModel_Instanced(vertexData_Capture, piecemodels.castBigIntArrayToFloat32(instanceData_Capture), "TRIANGLES", true),
	};
}

/**
 * Renders the current selected piece's legal move mesh,
 * IF a piece is selected.
 * 
 * The mesh should have been pre-calculated.
 */
function renderSelectedPiecesLegalMoves() {
	if (!pieceSelected) return; // No model to render

	const boardPos: BDCoords = boardpos.getBoardPos();
	// Add the model's offset
	const position = arrowlegalmovehighlights.getModelPosition(boardPos, model_Offset, 0);
	const boardScale: number = boardpos.getBoardScaleAsNumber();
	const scale: Vec3 = [boardScale, boardScale, 1];
	
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
 * @param boardsim - A reference to the current loaded gamefile's board
 */
function concatData_HighlightedMoves_Individual(instanceData_NonCapture: bigint[], instanceData_Capture: bigint[], legalMoves: LegalMoves, boardsim: Board) {
	// Get an array of the list of individual legal squares the current selected piece can move to
	const legalIndividuals: Coords[] = legalMoves.individual;
	if (!legalIndividuals) return; // This piece doesn't have any legal jumping/individual moves.

	// For each of these squares, calculate it's buffer data
	for (const coord of legalIndividuals) {
		const isPieceOnCoords = boardutil.isPieceOnCoords(boardsim.pieces, coord);
		const offsetCoord = coordutil.subtractCoords(coord, model_Offset);
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
 * @param friendlyColor - The color of friendly pieces
 */
function concatData_HighlightedMoves_Sliding(instanceData_NonCapture: bigint[], instanceData_Capture: bigint[], coords: Coords, legalMoves: LegalMoves, gamefile: FullGame, friendlyColor: Player) { // { left, right, bottom, top} The size of the box we should render within
	if (!legalMoves.sliding) return; // No sliding moves

	for (const [lineKey, limits] of Object.entries(legalMoves.sliding)) { // '1,0'
		const line: Coords = coordutil.getCoordsFromKey(lineKey as CoordsKey); // [dx,dy]
		const [ intsect1Tile, intsect2Tile ] = geometry.findLineBoxIntersections(coords, line, boundingBoxOfRenderRange);

		if (!intsect1Tile || !intsect2Tile) continue; // If there's no intersection point, it's off the screen, or directly intersect the corner, don't bother rendering.
        
		concatData_HighlightedMoves_Diagonal(instanceData_NonCapture, instanceData_Capture, coords, line, intsect1Tile, intsect2Tile, limits, legalMoves.ignoreFunc, gamefile, friendlyColor, legalMoves.brute);
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
 * @param ignoreFunc - The ignore function
 * @param gamefile - A reference to the current loaded gamefile
 * @param friendlyColor - The color of friendly pieces
 * @param brute - If true, each move will be simulated as to whether it results in check, and if so, not added to the mesh data.
 */
function concatData_HighlightedMoves_Diagonal(instanceData_NonCapture: bigint[], instanceData_Capture: bigint[], coords: Coords, step: Vec2, intsect1Tile: IntersectionPoint, intsect2Tile: IntersectionPoint, limits: SlideLimits, ignoreFunc: IgnoreFunction, gamefile: FullGame, friendlyColor: Player, brute?: boolean) {
	// Right moveset
	if (!intsect2Tile.positiveDotProduct) {
		// The start coords are either on screen, or points towards the screen
		concatData_HighlightedMoves_Diagonal_Split(instanceData_NonCapture, instanceData_Capture, coords, step,    intsect1Tile.coords, intsect2Tile.coords, limits[1], 		    ignoreFunc, gamefile, friendlyColor, brute);
	} // else the start coords are off screen and point in the opposite direction of the screen
    
	// Left moveset
	const negStep: Vec2 = [step[0] * -1n, step[1] * -1n];
	if (intsect1Tile.positiveDotProduct) {
		// The start coords are either on screen, or points towards the screen
		concatData_HighlightedMoves_Diagonal_Split(instanceData_NonCapture, instanceData_Capture, coords, negStep, intsect1Tile.coords, intsect2Tile.coords, limits[0], ignoreFunc, gamefile, friendlyColor, brute);
	} // else the start coords are off screen and point in the opposite direction of the screen
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
 * @param ignoreFunc - The ignore function, to ignore squares
 * @param gamefile - A reference to the current loaded gamefile
 * @param friendlyColor - The color of friendly pieces
 * @param brute - If true, each move will be simulated as to whether it results in check, and if so, not added to the mesh data.
 */
function concatData_HighlightedMoves_Diagonal_Split(instanceData_NonCapture: bigint[], instanceData_Capture: bigint[], coords: Coords, step: Vec2, intsect1Tile: BDCoords, intsect2Tile: BDCoords, limit: bigint | null, ignoreFunc: IgnoreFunction, gamefile: FullGame, friendlyColor: Player, brute?: boolean) {
	if (limit === 0n) return; // Quick exit

	const iterationInfo = getRayIterationInfo(coords, step, intsect1Tile, intsect2Tile, limit, false);
	if (iterationInfo === undefined) return;
	const { firstInstancePositionOffset, startCoords, iterationCount } = iterationInfo;

	addDataDiagonalVariant(instanceData_NonCapture, instanceData_Capture, firstInstancePositionOffset, step, iterationCount, startCoords, coords, ignoreFunc, gamefile, friendlyColor, brute);
}

/**
 * Calculates how many times a highlight should be repeated to cover all squares a ray can reach in the render range.
 * @param coords 
 * @param step 
 * @param intsect1Tile 
 * @param intsect2Tile 
 * @param limit 
 * @param includeStartCoords - Set to true for rays, it will also highlight the starting coordinate.
 * @returns 
 */
function getRayIterationInfo(coords: Coords, step: Vec2, intsect1Tile: BDCoords, intsect2Tile: BDCoords, limit: bigint | null, includeStartCoords: boolean) {
	const lineIsVertical = step[0] === 0n;
	const axis: 0 | 1 = lineIsVertical ? 1 : 0;
	const inverseAxis: 0 | 1 = 1 - axis as 0 | 1;

	const stepIsPositive = step[axis] > 0;
	const entryIntsectTile = stepIsPositive ? intsect1Tile : intsect2Tile;
	const exitIntsectTile = stepIsPositive ? intsect2Tile : intsect1Tile;
    
	// Where the piece would land after 1 step
	let startCoords: Coords = [...coords];
	if (!includeStartCoords) {
		startCoords[0] += step[0];
		startCoords[1] += step[1];
	}

	const startCoordsBD = bd.FromCoords(startCoords);
	const stepBD = bd.FromCoords(step);

	// Is the piece left, off-screen, of our intsect1Tile? Then adjust our start square
	if (stepIsPositive && bd.compare(startCoordsBD[axis], entryIntsectTile[axis]) < 0 ||
		!stepIsPositive && bd.compare(startCoordsBD[axis], entryIntsectTile[axis]) > 0) { // Modify the start square
		const distToEntryIntsectTile: BigDecimal = bd.subtract(entryIntsectTile[axis], startCoordsBD[axis]); // Can be negative
		const distInSteps: bigint = bd.toBigInt(bd.ceil(bd.divide_fixed(distToEntryIntsectTile, stepBD[axis]))); // Should always be positive
		const distRoundedUpToNearestStep: bigint = distInSteps * step[axis]; // Can be negative
		const newAxisStart = startCoords[axis] + distRoundedUpToNearestStep;

		// const yxToXStepRatio = step[inverseAxis] / step[axis];hfhhf
		// const newInverseAxisStart = startCoords[inverseAxis] + distRoundedUpToNearestStep * yxToXStepRatio;
		// NEW. Perfect integers?
		const inverseAxisDistRoundedUpToNearestStep: bigint = distInSteps * step[inverseAxis]; // Can be negative
		const newInverseAxisStart = startCoords[inverseAxis] + inverseAxisDistRoundedUpToNearestStep;

		startCoords = lineIsVertical ? [newInverseAxisStart, newAxisStart] : [newAxisStart, newInverseAxisStart];
	}

	let endCoords = exitIntsectTile;
	// Is the exitIntsectTile farther than we can legally slide? Then adjust our end square
	if (limit !== null) {
		const furthestAxisSquareWeCanSlide = coords[axis] + step[axis] * limit;
		const furthestAxisSquareWeCanSlideBD = bd.FromBigInt(furthestAxisSquareWeCanSlide);
		if (stepIsPositive && bd.compare(furthestAxisSquareWeCanSlideBD, endCoords[axis]) < 0 ||
			!stepIsPositive && bd.compare(furthestAxisSquareWeCanSlideBD, endCoords[axis]) > 0) {
			// The furthest square we can slide to does NOT reach the outside of the screen.
			const furthestInverseAxisSquareWeCanSlide = coords[inverseAxis] + step[inverseAxis] * limit;
			endCoords = lineIsVertical ? [furthestInverseAxisSquareWeCanSlide, furthestAxisSquareWeCanSlide] : [furthestAxisSquareWeCanSlide, furthestAxisSquareWeCanSlide];
		}
	}

	// Shift the vertex data of our first step to the right place
	const firstInstancePositionOffset: Coords = coordutil.subtractCoords(startCoords, model_Offset);

	// Calculate how many times we need to iteratively shift this vertex data and append it to our vertex data array
	const axisDistFromStartToEnd = stepIsPositive ? endCoords[axis] - startCoords[axis] : startCoords[axis] - endCoords[axis]; // Always positive
	const iterationCount = Math.floor((axisDistFromStartToEnd + Math.abs(step[axis])) / Math.abs(step[axis])); // How many legal move square/dots to render on this line

	return { firstInstancePositionOffset, startCoords, iterationCount };
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
 * @param pieceCoords - The coordinates of the piece with the legal moves
 * @param ignoreFunc - The ignore function, to ignore squares
 * @param gamefile - A reference to the current loaded gamefile
 * @param friendlyColor - The color of friendly pieces
 * @param brute - If true, each move will be simulated as to whether it results in check, and if so, not added to the mesh data.
 */
function addDataDiagonalVariant(instanceData_NonCapture: bigint[], instanceData_Capture: bigint[], firstInstancePositionOffset: Coords, step: Vec2, iterateCount: number, startCoords: Coords, pieceCoords: Coords, ignoreFunc: IgnoreFunction, gamefile: FullGame, friendlyColor: Player, brute?: boolean) {
	for (let i = 0; i < iterateCount; i++) { 
		const thisCoord = [startCoords[0] + step[0] * i, startCoords[1] + step[1] * i] as Coords;
		legal: if (ignoreFunc(pieceCoords, thisCoord)) { // Ignore function PASSED. This move is LEGAL

			// If we're brute force checking each move for check, do that here. (royal queen, or colinear pins)
			if (brute) {
				const moveDraft: MoveDraft = { startCoords: pieceCoords, endCoords: thisCoord };
				if (checkresolver.getSimulatedCheck(gamefile, moveDraft, friendlyColor).check) break legal;
			}

			// Should we add instance data to the capturing or non-capturing model?
			const isPieceOnCoords = boardutil.isPieceOnCoords(gamefile.boardsim.pieces, thisCoord);
			if (isPieceOnCoords) instanceData_Capture.push(...firstInstancePositionOffset);
			else                 instanceData_NonCapture.push(...firstInstancePositionOffset);
		}
		firstInstancePositionOffset[0] += step[0];
		firstInstancePositionOffset[1] += step[1];
	}
}

/** Renders an outline of the box containing all legal move highlights. */
function renderOutlineofRenderBox() {
	if (!camera.getDebug()) return; // Skip if camera debug mode off

	const color = [1,0,1, 1];
	const data = shapes.getDataRect_FromTileBoundingBox(boundingBoxOfRenderRange, color);

	const model = createModel(data, 2, "LINE_LOOP", true);
	model.render();
}


// Rays --------------------------------------------------------------------------------------


/**
 * Calculates the instanceData of all Rays in a list.
 * Rays are square highlights starting from a single coord
 * and going in one direction to infinity, unobstructed.
 */
function genData_Rays(rays: Ray[]) { // { left, right, bottom, top} The size of the box we should render within
	const instanceData: number[] = [];

	for (const ray of rays) {
		const vector = coordutil.copyCoords(ray.vector);
		// Make the vector positive
		if (vector[0] === 0 && vector[1] < 0) vector[1] *= -1;
		else if (vector[0] < 0) { vector[0] *= -1; vector[1] *= -1; }

		const intersections = geometry.findLineBoxIntersections(ray.start, vector, boundingBoxOfRenderRange);
		const [ intsect1Tile, intsect2Tile ] = intersections.map(intersection => intersection.coords);

		if (!intsect1Tile || !intsect2Tile) continue; // If there's no intersection point, it's off the screen, or directly intersect the corner, don't bother rendering.
        
		concatData_Ray(instanceData, ray.start, ray.vector, intsect1Tile, intsect2Tile);
	}

	return instanceData;
}

/** Simplified {@link concatData_HighlightedMoves_Diagonal_Split} for Ray drawing */
function concatData_Ray(instanceData: number[], coords: Coords, step: Vec2, intsect1Tile: Coords, intsect2Tile: Coords) {
	const iterationInfo = getRayIterationInfo(coords, step, intsect1Tile, intsect2Tile, Infinity, true);
	if (iterationInfo === undefined) return;
	const { firstInstancePositionOffset, iterationCount } = iterationInfo;

	addDataDiagonalVariant_Ray(instanceData, firstInstancePositionOffset, step, iterationCount);
}

/** Simplified {@link addDataDiagonalVariant} for Ray drawing */
function addDataDiagonalVariant_Ray(instanceData: number[], firstInstancePositionOffset: Coords, step: Vec2, iterateCount: number) {
	for (let i = 0; i < iterateCount; i++) { 
		instanceData.push(...firstInstancePositionOffset);
		firstInstancePositionOffset[0] += step[0];
		firstInstancePositionOffset[1] += step[1];
	}
}


// Exports -----------------------------------------------------------------------------------


export default {
	render,
	getOffset,
	onPieceSelected,
	onPieceUnselected,
	generateModelsForPiecesLegalMoveHighlights,

	genData_Rays,
};