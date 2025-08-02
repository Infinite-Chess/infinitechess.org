
// src/client/scripts/esm/game/rendering/highlights/legalmovemodel.ts

/**
 * [ZOOMED IN] This script handles the model
 * generation of piece's legal move highlights.
 */

import type { Player } from '../../../chess/util/typeutil.js';
import type { Color } from '../../../util/math/math.js';
import type { BDCoords, Coords, CoordsKey, DoubleCoords } from '../../../chess/util/coordutil.js';
import type { IgnoreFunction } from '../../../chess/logic/movesets.js';
import type { MoveDraft } from '../../../chess/logic/movepiece.js';
import type { LegalMoves, SlideLimits } from '../../../chess/logic/legalmoves.js';
import type { Board, FullGame } from '../../../chess/logic/gamefile.js';
import type { Ray, Vec2, Vec2Key } from '../../../util/math/vectors.js';

import coordutil from '../../../chess/util/coordutil.js';
import gameslot from '../../chess/gameslot.js';
import boardutil from '../../../chess/util/boardutil.js';
import preferences from '../../../components/header/preferences.js';
import checkresolver from '../../../chess/logic/checkresolver.js';
import boardpos from '../boardpos.js';
import boardtiles from '../boardtiles.js';
import piecemodels from '../piecemodels.js';
import legalmoveshapes from '../instancedshapes.js';
import space from '../../misc/space.js';
import geometry, { IntersectionPoint } from '../../../util/math/geometry.js';
import bounds, { BoundingBoxBD } from '../../../util/math/bounds.js';
import bd, { BigDecimal } from '../../../util/bigdecimal/bigdecimal.js';
import { BufferModelInstanced, createModel, createModel_Instanced } from '../buffermodel.js';
// @ts-ignore
import perspective from '../perspective.js';
// @ts-ignore
import camera from '../camera.js';
// @ts-ignore
import shapes from '../shapes.js';
import vectors from '../../../util/math/vectors.js';
import bimath from '../../../util/bigdecimal/bimath.js';



// Constants -----------------------------------------------------------------------------


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


/** The distance, in perspective mode, we want to aim to render legal moves highlights out to, or farther. */
const PERSPECTIVE_VIEW_RANGE = 1000;
/** Amount of screens in number the render range bounding box should try to aim for beyond the screen. */
const multiplier = 4;
/**
 * In perspective mode, visible range is considered 1000. This is the multiplier to that for the render range bounding box.
 */
const multiplier_perspective = 2;


const ZERO: BigDecimal = bd.FromBigInt(0n);


// Variables -----------------------------------------------------------------------------


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
 * THIS REPRESENTS THE INTEGER TILES INCLUDED IN THE RANGE.
 * For example, a `right` of 10 means it includes the X=10 tiles.
 */
let boundingBoxOfRenderRange: BoundingBoxBD | undefined;

/**
 * How much the vertex data of the highlight models has been offset, to make their numbers
 * close to zero, to avoid floating point imprecision.
 * 
 * This is the nearest multiple of {@link highlightedMovesRegenRange} our camera is at.
 */
let model_Offset: Coords = [0n,0n];


// Updating Render Range and Offset --------------------------------------------------


/** Returns {@link model_Offset} */
function getOffset() {
    return model_Offset;
}

/**
 * Updates the offset and bounding box universal to all rendered legal move highlights.
 * If a change is made, it calls to regenerate the model.
 * @returns Whether a change was made, updating it.
 */
function updateRenderRange(): boolean {

    // Determine if our camera/screen exceeds the boundary of our render range box...
	if (!isViewRangeContainedInRenderRange()) return false; // No change needed

    // Regenerate the legal move highlights render range bounding box

    // console.log("Recalculating bounding box of render range.");

    const [ newWidth, newHeight ] = perspective.getEnabled() ? getDimensionsOfPerspectiveViewRange()
                                                             : getDimensionsOfOrthographicViewRange();

    const halfNewWidth: BigDecimal = bd.FromNumber(newWidth / 2);
    const halfNewHeight: BigDecimal = bd.FromNumber(newHeight / 2);

    const boardPos = boardpos.getBoardPos();

    boundingBoxOfRenderRange = {
        left: space.roundCoord(bd.subtract(boardPos[0], halfNewWidth)),
        right: space.roundCoord(bd.add(boardPos[0], halfNewWidth)),
        bottom: space.roundCoord(bd.subtract(boardPos[1], halfNewHeight)),
        top: space.roundCoord(bd.add(boardPos[1], halfNewHeight))
    };

    /** Update our offset to the nearest grid-point multiple of {@link highlightedMovesRegenRange} */
    model_Offset = geometry.roundPointToNearestGridpoint(boardpos.getBoardPos(), highlightedMovesRegenRange);

    // console.log("Shifted offset of highlights.");

    return true; // A change was made
}


/**
 * Returns whether our camera/screen view box is contained within
 * our legal move highlights render range box,
 * OR if it's significantly smaller than it.
 */
function isViewRangeContainedInRenderRange() {
    if (!boundingBoxOfRenderRange) return false; // It isn't even initiated yet 

    // The bounding box of what the camera currently sees on-screen.
    const boundingBoxOfView: BoundingBoxBD = perspective.getEnabled() ?
        getBoundingBoxOfPerspectiveView() :
        boardtiles.gboundingBoxFloat();

    // In 2D mode, we also care about whether the
    // camera box is significantly smaller than our render range.
    if (!perspective.getEnabled()) {
        // We can cast to number since we're confident it's going to be small (we are zoomed in)
        const width: number = bd.toNumber(bd.subtract(boundingBoxOfView.right, boundingBoxOfView.left));
        const renderRangeWidth: number = bd.toNumber(bd.subtract(boundingBoxOfRenderRange.right, boundingBoxOfRenderRange.left)) + 1;

        // multiplier needs to be squared cause otherwise when we zoom in it regenerates the render box every frame.
        if (width * multiplier * multiplier < renderRangeWidth) return false;
    }

    // Whether the camera view box exceeds the boundaries of the render range
    return bounds.boxContainsBox(boundingBoxOfRenderRange, boundingBoxOfView);
}

/** [PERSPECTIVE] Returns our approximate camera view range bounding box. */
function getBoundingBoxOfPerspectiveView(): BoundingBoxBD {
    const boardPos = boardpos.getBoardPos();
    const viewDist: BigDecimal = bd.FromNumber(PERSPECTIVE_VIEW_RANGE);
    return {
        left: bd.subtract(boardPos[0], viewDist),
        right: bd.add(boardPos[0], viewDist),
        bottom: bd.subtract(boardPos[1], viewDist),
        top: bd.add(boardPos[1], viewDist)
    };
}

/** [PERSPECTIVE] Returns the target dimensions of the legal move highlights box. */
function getDimensionsOfPerspectiveViewRange(): DoubleCoords {
	const width = PERSPECTIVE_VIEW_RANGE * 2;
	const newWidth = width * multiplier_perspective;
	return [newWidth, newWidth];
}

/** [ORTHOGRAPHIC] Returns the target dimensions of the legal move highlights box. */
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
        // const ratio = capWidth / newWidth;
        // newWidth *= ratio;
        // newHeight *= ratio;
        throw Error("Legal move highlights bounding box render range width exceeded cap! Don't recalculate it if we're zoomed out.");
    }

    return [newWidth, newHeight];
}


// Generating Legal Move Buffer Models ----------------------------------------------------------------------------------


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
	pushIndividual(instanceData_NonCapture, instanceData_Capture, legalMoves, gamefile.boardsim);
	// Potentially infinite data on sliding moves...
	pushSliding(instanceData_NonCapture, instanceData_Capture, coords, legalMoves, gamefile, friendlyColor);

	return {
		// The NON-CAPTURING legal move highlights model
		NonCaptureModel: createModel_Instanced(vertexData_NonCapture, piecemodels.castBigIntArrayToFloat32(instanceData_NonCapture), "TRIANGLES", true),
		// The CAPTURING legal move highlights model
		CaptureModel: createModel_Instanced(vertexData_Capture, piecemodels.castBigIntArrayToFloat32(instanceData_Capture), "TRIANGLES", true),
	};
}


// Individual Moves ------------------------------------------------------------------------------------------------------


/**
 * Calculates instanceposition data of legal individual (jumping) moves and appends it to the provided instance data arrays.
 * @param instanceData_NonCapture - The running array of instance data for the NON-CAPTURING legal moves highlights mesh.
 * @param instanceData_Capture - The running array of instance data for the CAPTURING legal moves highlights mesh.
 * @param legalMoves - The piece legal moves to highlight
 * @param boardsim - A reference to the current loaded gamefile's board
 */
function pushIndividual(instanceData_NonCapture: bigint[], instanceData_Capture: bigint[], legalMoves: LegalMoves, boardsim: Board) {
	// Get an array of the list of individual legal squares the current selected piece can move to
	const legalIndividuals: Coords[] = legalMoves.individual;

	// For each of these squares, calculate it's buffer data
	for (const coord of legalIndividuals) {
		const offsetCoord = coordutil.subtractCoords(coord, model_Offset);
		const isPieceOnCoords = boardutil.isPieceOnCoords(boardsim.pieces, coord);
		if (isPieceOnCoords) instanceData_Capture.push(...offsetCoord);
		else instanceData_NonCapture.push(...offsetCoord);
	}
}


// Sliding Moves ------------------------------------------------------------------------------------------------------


/**
 * Calculates instanceposition data of legal sliding moves and appends it to the running instance data arrays.
 * @param instanceData_NonCapture - The running array of instance data for the NON-CAPTURING legal moves highlights mesh.
 * @param instanceData_Capture - The running array of instance data for the CAPTURING legal moves highlights mesh.
 * @param coords - The coords of the piece with the provided legal moves
 * @param legalMoves - The piece legal moves to highlight
 * @param gamefile - A reference to the current loaded gamefile
 * @param friendlyColor - The color of friendly pieces
 */
function pushSliding(
	instanceData_NonCapture: bigint[],
	instanceData_Capture: bigint[],
	coords: Coords,
	legalMoves: LegalMoves,
	gamefile: FullGame,
	friendlyColor: Player
): void {

	for (const [lineKey, limits] of Object.entries(legalMoves.sliding)) { // '1,0'
		const line: Vec2 = vectors.getVec2FromKey(lineKey as Vec2Key); // [dx,dy]

		// The intersection points this slide direction intersects
		// our legal move highlights render range bounding box, if it does.
		let [intsect1Tile, intsect2Tile] = geometry.findLineBoxIntersections(coords, line, boundingBoxOfRenderRange!);

		if (!intsect1Tile && !intsect2Tile) continue; // No intersection point (off the screen).
		if (!intsect2Tile) intsect2Tile = intsect1Tile; // If there's only one corner intersection, make the exit point the same as the entry.
        
		pushSlide(instanceData_NonCapture, instanceData_Capture, coords, line, intsect1Tile, intsect2Tile, limits, legalMoves.ignoreFunc, gamefile, friendlyColor, legalMoves.brute);
	}
}

/**
 * Adds the instanceposition data of a directional movement line, in both directions, of ANY SLOPED step to the running instance data arrays.
 * @param instanceData_NonCapture - The running array of instance data for the NON-CAPTURING legal moves highlights mesh.
 * @param instanceData_Capture - The running array of instance data for the CAPTURING legal moves highlights mesh.
 * @param coords - The coords of the piece with the provided legal moves
 * @param step - Of the line / moveset
 * @param intsect1 - What point this line intersect the left side of the screen box.
 * @param intsect2 - What point this line intersect the right side of the screen box.
 * @param limits - Slide limit: [-7,Infinity]
 * @param ignoreFunc - The ignore function
 * @param gamefile - A reference to the current loaded gamefile
 * @param friendlyColor - The color of friendly pieces
 * @param brute - If true, each move will be simulated as to whether it results in check, and if so, not added to the mesh data.
 */
function pushSlide(
	instanceData_NonCapture: bigint[],
	instanceData_Capture: bigint[],
	coords: Coords,
	step: Vec2,
	intsect1: IntersectionPoint,
	intsect2: IntersectionPoint,
	limits: SlideLimits,
	ignoreFunc: IgnoreFunction,
	gamefile: FullGame,
	friendlyColor: Player,
	brute?: boolean
) {
	// Right moveset...

	if (!intsect2.positiveDotProduct) {
		// The start coords are either on screen, or the ray points towards the screen
		pushRay(instanceData_NonCapture, instanceData_Capture, coords, step,    intsect1, intsect2, limits[1], ignoreFunc, gamefile, friendlyColor, brute);
	} // else the start coords are off screen and ray points in the opposite direction of the screen
    
	// Left moveset...

	// Negate the vector
	const negStep: Vec2 = vectors.negateVector(step);

	// Switch the order of intersections and negate their dot product
	const negVecIntsect1: IntersectionPoint = {
		coords: intsect2.coords,
		positiveDotProduct: !intsect2.positiveDotProduct,
	}
	const negVecIntsect2: IntersectionPoint = {
		coords: intsect1.coords,
		positiveDotProduct: !intsect1.positiveDotProduct,
	}

	if (!negVecIntsect2.positiveDotProduct) {
		// The start coords are either on screen, or the ray points towards the screen
		pushRay(instanceData_NonCapture, instanceData_Capture, coords, negStep, negVecIntsect1, negVecIntsect2, limits[0], ignoreFunc, gamefile, friendlyColor, brute);
	} // else the start coords are off screen and ray points in the opposite direction of the screen
}

/**
 * Adds the instanceposition data of a single directional ray (split in 2 from a normal slide) to the running instance data arrays.
 * @param instanceData_NonCapture - The running array of instance data for the NON-CAPTURING legal moves highlights mesh.
 * @param instanceData_Capture - The running array of instance data for the CAPTURING legal moves highlights mesh.
 * @param coords - The coords of the piece with the provided legal moves
 * @param step - Of the line / moveset
 * @param intsect1 - What point this line intersect the left side of the screen box.
 * @param intsect2 - What point this line intersect the right side of the screen box.
 * @param limit - Needs to be POSITIVE.
 * @param ignoreFunc - The ignore function, to ignore squares
 * @param gamefile - A reference to the current loaded gamefile
 * @param friendlyColor - The color of friendly pieces
 * @param brute - If true, each move will be simulated as to whether it results in check, and if so, not added to the mesh data.
 */
function pushRay(
	instanceData_NonCapture: bigint[],
	instanceData_Capture: bigint[],
	coords: Coords,
	step: Vec2,
	intsect1: IntersectionPoint,
	intsect2: IntersectionPoint,
	limit: bigint | null,
	ignoreFunc: IgnoreFunction,
	gamefile: FullGame,
	friendlyColor: Player,
	brute?: boolean
) {
	if (limit === 0n) return; // Can't slide any spaces this ray's direction

	const { firstInstancePositionOffset, startCoords, iterationCount } = getRayIterationInfo(coords, step, intsect1, intsect2, limit, false);

	// Recursively adds the coords to the instance data list, shifting by the step size.
	let targetCoords: Coords = startCoords;
	for (let i = 0; i < iterationCount; i++) {
		targetCoords[0] += step[0];
		targetCoords[1] += step[1];

		legal: if (ignoreFunc(coords, targetCoords)) { // Ignore function PASSED. This move is LEGAL

			// If we're brute force checking each move for check, do that here. (royal queen, or colinear pins)
			if (brute) {
				const moveDraft: MoveDraft = { startCoords: coords, endCoords: targetCoords };
				if (checkresolver.getSimulatedCheck(gamefile, moveDraft, friendlyColor).check) break legal;
			}

			const isPieceOnCoords = boardutil.isPieceOnCoords(gamefile.boardsim.pieces, targetCoords);
			if (isPieceOnCoords) instanceData_Capture.push(...firstInstancePositionOffset);
			else instanceData_NonCapture.push(...firstInstancePositionOffset);
		}
		
		firstInstancePositionOffset[0] += step[0];
		firstInstancePositionOffset[1] += step[1];
	}
}

/**
 * Calculates how many times a highlight should be repeated to cover all squares a ray can reach in the render range.
 * @param coords 
 * @param step 
 * @param intsect1 
 * @param intsect2 
 * @param limit 
 * @param isRay - This will also include the starting coordinate, as is not the behavior for selected pieces.
 * @returns 
 */
function getRayIterationInfo(coords: Coords, step: Vec2, intsect1: IntersectionPoint, intsect2: IntersectionPoint, limit: bigint | null, isRay: boolean) {
	const coordsBD: BDCoords = bd.FromCoords(coords);
	const stepBD: BDCoords = bd.FromCoords(step);

	const axis: 0 | 1 = step[0] === 0n ? 1 : 0; // Use the y axis if the x movement vector is zero
    
	// Determine the start coords.

	let startCoords: Coords = [...coords];
	if (!isRay) {
		// The first highlight starts 1 square off the piece coords
		startCoords[0] += step[0];
		startCoords[1] += step[1];
	}

	// Is the piece left, off-screen, of our intsect1Tile? Then adjust our start square
	if (intsect1.positiveDotProduct) { // Modify the start square
		const axisDistToIntsect1: BigDecimal = bd.subtract(intsect1[axis], coordsBD[axis]); // Can be negative
		const distInSteps: bigint = bd.toBigInt(bd.ceil(bd.divide_fixed(axisDistToIntsect1, stepBD[axis]))); // Minimum number of steps to overtake the first intersection.
		startCoords = [
			coords[0] + step[0] * distInSteps,
			coords[1] + step[1] * distInSteps
		];
	}

	// Determine the end coords.

	// How many steps could we take before we reached intsect2?
	const axisDistanceToIntsect2: BigDecimal = bd.subtract(intsect2.coords[axis], coordsBD[axis]);
	// The maximum number of steps we can take before exceeding the screen edge
	const axisStepsToReachIntsect2: bigint = bd.toBigInt(bd.floor(bd.divide_fixed(axisDistanceToIntsect2, stepBD[axis])));
	let endCoords: Coords = [
		coords[0] + step[0] * axisStepsToReachIntsect2,
		coords[1] + step[1] * axisStepsToReachIntsect2
	];

	if (limit !== null) {
		// Determine if we can't slide as far as to reach intsect2. If so, we need to shorten our endCoords

		// What is the farthest point we can slide?
		const furthestSquareWeCanSlide: Coords = [
			coords[0] + step[0] * limit,
			coords[1] + step[1] * limit,
		];
		const furthestSquareWeCanSlideBD: BDCoords = bd.FromCoords(furthestSquareWeCanSlide);

		const vectorFromFurthestSquareTowardsIntsect = coordutil.subtractBDCoords(intsect2.coords, furthestSquareWeCanSlideBD);
		const dotProd = vectors.dotProductBD(vectorFromFurthestSquareTowardsIntsect, stepBD)
		// A dotProd of zero would mean it can slide EXACTLY up to the end of the screen, that is okay
		// But positive means we can't slide far enough to reach intsect2. Shorten our endCoords!
		if (bd.compare(dotProd, ZERO) > 0) endCoords = furthestSquareWeCanSlide;
	}

	// Next, determine firstInstancePositionOffset and iterationCount.

	// Shift the vertex data of our first step to the right place
	const firstInstancePositionOffset: Coords = coordutil.subtractCoords(startCoords, model_Offset);

	// Calculate how many times we need to iteratively shift this vertex data and append it to our vertex data array
	const axisDistFromStartToEnd = endCoords[axis] - startCoords[axis]; // Always positive
	const iterationCount = Number(axisDistFromStartToEnd / step[axis]); // How many legal move square/dots to render on this line

	return { firstInstancePositionOffset, startCoords, iterationCount };
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

/** Simplified {@link pushRay} for Ray drawing */
function concatData_Ray(instanceData: number[], coords: Coords, step: Vec2, intsect1Tile: Coords, intsect2Tile: Coords) {
	const iterationInfo = getRayIterationInfo(coords, step, intsect1Tile, intsect2Tile, null, true);
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


// Rendering ----------------------------------------------------------------------------------------


/**
 * [DEBUG] Renders an outline of the box containing all legal move highlights.
 * Will only be visible if camera debug mode is on, as this is normally outside of the screen edge.
 */
function renderOutlineofRenderBox() {
	const color: Color = [1,0,1, 1];
	const data = shapes.getDataRect_FromTileBoundingBox(boundingBoxOfRenderRange, color);

	createModel(data, 2, "LINE_LOOP", true).render();
}


// Exports ------------------------------------------------------------------------------------------


export default {
    // Updating Render Range and Offset
    getOffset,
    updateRenderRange,
    // Generating Legal Move Buffer Models
    generateModelsForPiecesLegalMoveHighlights,
	// Rays
	genData_Rays,
    // Rendering
    renderOutlineofRenderBox,
}