
// src/client/scripts/esm/game/rendering/highlights/legalmovemodel.ts

/**
 * [ZOOMED IN] This script handles the model
 * generation of piece's legal move highlights.
 * 
 * That also includes Rays.
 */

import type { Player } from '../../../chess/util/typeutil.js';
import type { Color } from '../../../util/math/math.js';
import type { BDCoords, Coords, DoubleCoords } from '../../../chess/util/coordutil.js';
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
import vectors from '../../../util/math/vectors.js';
import instancedshapes from '../instancedshapes.js';
import geometry, { IntersectionPoint } from '../../../util/math/geometry.js';
import bounds, { BoundingBox, BoundingBoxBD } from '../../../util/math/bounds.js';
import bd, { BigDecimal } from '../../../util/bigdecimal/bigdecimal.js';
import { AttributeInfoInstanced, BufferModelInstanced, createModel, createModel_Instanced, createModel_Instanced_GivenAttribInfo } from '../buffermodel.js';
import meshes from '../meshes.js';
import perspective from '../perspective.js';
import primitives from '../primitives.js';
import bimath from '../../../util/bigdecimal/bimath.js';


// Type Definitions ------------------------------------------------------------


/** Information for iterating the instance data of a legal move line as far as it needs to be rendered. */
type RayIterationInfo = {
	/** The first TRUE coordinate the ray starts on. */
	startCoords: Coords;
	/** The OFFSET coordinate the ray starts on. */
	startCoordsOffset: Coords;
	/** How many times to repeat a highlight in one direction for this given ray. */
	iterationCount: number;
}


// Constants -----------------------------------------------------------------------------


/** The attribute info for all legal move highlight instanced rendering models. */
const ATTRIB_INFO: AttributeInfoInstanced = {
	vertexDataAttribInfo: [{ name: 'position', numComponents: 2 }, { name: 'color', numComponents: 4 }],
	instanceDataAttribInfo: [{ name: 'instanceposition', numComponents: 2 }]
};

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
let boundingBoxOfRenderRange: BoundingBox | undefined;

/**
 * How much the vertex data of the highlight models has been offset, to make their numbers
 * close to zero, to avoid floating point imprecision.
 * 
 * This is the nearest multiple of {@link highlightedMovesRegenRange} our camera is at.
 */
let model_Offset: Coords = [0n,0n];


// Updating Render Range and Offset --------------------------------------------------


/** Returns {@link model_Offset} */
function getOffset(): Coords {
	return model_Offset;
}

/**
 * Updates the offset and bounding box universal to all rendered legal move highlights.
 * If a change is made, it calls to regenerate the model.
 * @returns Whether a change was made, updating it.
 */
function updateRenderRange(): boolean {

	// Determine if our camera/screen exceeds the boundary of our render range box...
	if (isViewRangeContainedInRenderRange()) return false; // No change needed

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
function isViewRangeContainedInRenderRange(): boolean {
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
		const renderRangeWidth: number = Number(boundingBoxOfRenderRange.right - boundingBoxOfRenderRange.left) + 1;

		// multiplier needs to be squared cause otherwise when we zoom in it regenerates the render box every frame.
		if (width * multiplier * multiplier < renderRangeWidth) return false;
	}

	const floatingRenderRangeBox = meshes.expandTileBoundingBoxToEncompassWholeSquare(boundingBoxOfRenderRange);
	// Whether the camera view box exceeds the boundaries of the render range
	return bounds.boxContainsBoxBD(floatingRenderRangeBox, boundingBoxOfView);
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

	const boundingBoxOfView = boardtiles.gboundingBox(false);
	const width: number = Number(boundingBoxOfView.right - boundingBoxOfView.left) + 1; // Need to +1 since the board bounding box just includes the integer squares, not floating point edges.
	const height: number = Number(boundingBoxOfView.top - boundingBoxOfView.bottom) + 1;

	const newWidth = width * multiplier;
	const newHeight = height * multiplier;

	if (boardpos.areZoomedOut()) throw Error("Don't recalculate legal move highlights box zoomed out!"); // Don't want to generate a stupidly large model

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
function generateModelsForPiecesLegalMoveHighlights(
	coords: Coords,
	legalMoves: LegalMoves,
	friendlyColor: Player,
	highlightColor: Color
): { NonCaptureModel: BufferModelInstanced, CaptureModel: BufferModelInstanced } {

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
function pushIndividual(instanceData_NonCapture: bigint[], instanceData_Capture: bigint[], legalMoves: LegalMoves, boardsim: Board): void {
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
		// eslint-disable-next-line prefer-const
		let [intsect1Tile, intsect2Tile] = geometry.findLineBoxIntersections(coords, line, boundingBoxOfRenderRange!);

		if (!intsect1Tile && !intsect2Tile) continue; // No intersection point (off the screen).
		if (!intsect2Tile) intsect2Tile = intsect1Tile; // If there's only one corner intersection, make the exit point the same as the entry.
        
		pushSlide(instanceData_NonCapture, instanceData_Capture, coords, line, intsect1Tile!, intsect2Tile!, limits, legalMoves.ignoreFunc, gamefile, friendlyColor, legalMoves.brute);
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
): void {
	// Right moveset...

	if (intsect2.positiveDotProduct) {
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
	};
	const negVecIntsect2: IntersectionPoint = {
		coords: intsect1.coords,
		positiveDotProduct: !intsect1.positiveDotProduct,
	};

	if (negVecIntsect2.positiveDotProduct) {
		// The start coords are either on screen, or the ray points towards the screen
		// The first index of slide limit is always negative
		const absoluteSlideLimit = limits[0] === null ? null : bimath.abs(limits[0]);
		pushRay(instanceData_NonCapture, instanceData_Capture, coords, negStep, negVecIntsect1, negVecIntsect2, absoluteSlideLimit, ignoreFunc, gamefile, friendlyColor, brute);
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
): void {
	if (limit === 0n) return; // Can't slide any spaces this ray's direction

	const iterationInfo: RayIterationInfo | undefined = getRayIterationInfo(coords, step, intsect1, intsect2, limit, false);
	if (!iterationInfo) return; // None of the piece's slide is visible on screen, skip.

	const { startCoords, startCoordsOffset, iterationCount } = iterationInfo;

	// Recursively adds the coords to the instance data list, shifting by the step size.
	const targetCoords: Coords = startCoords; // The true coords of the square we're checking
	for (let i = 0; i < iterationCount; i++) {
		legal: if (ignoreFunc(coords, targetCoords)) { // Ignore function PASSED. (Is a prime square for huygens)

			// If we're brute force checking each move for check, do that here. (royal queen, or colinear pins)
			if (brute) {
				const moveDraft: MoveDraft = { startCoords: coords, endCoords: targetCoords };
				if (checkresolver.getSimulatedCheck(gamefile, moveDraft, friendlyColor).check) break legal;
			}

			const isPieceOnCoords = boardutil.isPieceOnCoords(gamefile.boardsim.pieces, targetCoords);
			if (isPieceOnCoords) instanceData_Capture.push(...startCoordsOffset);
			else instanceData_NonCapture.push(...startCoordsOffset);
		}
		
		targetCoords[0] += step[0];
		targetCoords[1] += step[1];
		// The mesh-offset adjusted coords we're checking
		startCoordsOffset[0] += step[0];
		startCoordsOffset[1] += step[1];
	}
}

/**
 * Calculates how many times a highlight should be repeated
 * to cover all squares a ray can reach in the render range,
 * and calculates where it should start and end.
 * @param isRay - This will also include the starting coordinate, as is not the behavior for selected pieces.
 */
function getRayIterationInfo(coords: Coords, step: Vec2, intsect1: IntersectionPoint, intsect2: IntersectionPoint, limit: bigint | null, isRay: boolean): RayIterationInfo | undefined {
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

	// Is the piece off screen in the opposite direction of the step?
	if (intsect1.positiveDotProduct) {
		// Adjust the start square to be the first square we land on after intsect1.
		const axisDistToIntsect1: BigDecimal = bd.subtract(intsect1.coords[axis], coordsBD[axis]);
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
		// Determine if we can't even slide far enough to reach intsect2. If so, we need to shorten our endCoords

		// What is the farthest point we can slide to?
		const furthestSquareWeCanSlide: Coords = [
			coords[0] + step[0] * limit,
			coords[1] + step[1] * limit,
		];
		const furthestSquareWeCanSlideBD: BDCoords = bd.FromCoords(furthestSquareWeCanSlide);

		const vectorFromFurthestSquareTowardsIntsect = coordutil.subtractBDCoords(intsect2.coords, furthestSquareWeCanSlideBD);
		const dotProd = vectors.dotProductBD(vectorFromFurthestSquareTowardsIntsect, stepBD);
		// A dotProd of zero would mean it can slide EXACTLY up to the end of the screen, that is okay
		// But positive means we can't slide far enough to reach intsect2. Shorten our endCoords!
		if (bd.compare(dotProd, ZERO) > 0) endCoords = furthestSquareWeCanSlide;
	}

	// Next, determine iterationCount and startCoordsOffset.
	
	// Calculate how many times we need to iteratively shift this vertex data and append it to our vertex data array
	const axisDistFromStartToEnd: bigint = endCoords[axis] - startCoords[axis];
	// How many legal move squares/dots to render on this line
	const iterationCount = Number(axisDistFromStartToEnd / step[axis]) + 1; // +1 for start & end inclusive

	// This will occur if the piece isn't able to move past intsect1, the start of the screen.
	if (iterationCount <= 0) return undefined;

	// Shift the vertex data of our first step to the right place
	const startCoordsOffset: Coords = coordutil.subtractCoords(startCoords, model_Offset);


	return { startCoords, startCoordsOffset, iterationCount };
}


// Rays --------------------------------------------------------------------------------------


/**
 * Generates a model for rendering all rays in the provided list.
 * 
 * Rays are square highlights starting from a single coord
 * and going in one direction to infinity, unobstructed.
 */
function genModelForRays(rays: Ray[], color: Color): BufferModelInstanced {
	const vertexData = instancedshapes.getDataLegalMoveSquare(color);
	const instanceData: bigint[] = [];

	for (const ray of rays) {
		const step = ray.vector;

		// eslint-disable-next-line prefer-const
		let [ intsect1Tile, intsect2Tile ] = geometry.findLineBoxIntersections(ray.start, ray.vector, boundingBoxOfRenderRange!);
		
		if (!intsect1Tile && !intsect2Tile) continue; // No intersection point (off the screen).
		if (!intsect2Tile) intsect2Tile = intsect1Tile; // If there's only one corner intersection, make the exit point the same as the entry.
        
		const iterationInfo: RayIterationInfo | undefined = getRayIterationInfo(ray.start, ray.vector, intsect1Tile!, intsect2Tile!, null, true);
		if (iterationInfo === undefined) continue; // Technically should never happen for rays since they are never blocked.

		const { startCoordsOffset, iterationCount } = iterationInfo;

		for (let i = 0; i < iterationCount; i++) { 
			instanceData.push(...startCoordsOffset);
			startCoordsOffset[0] += step[0];
			startCoordsOffset[1] += step[1];
		}
	}

	return createModel_Instanced_GivenAttribInfo(vertexData, piecemodels.castBigIntArrayToFloat32(instanceData), ATTRIB_INFO, 'TRIANGLES');
}


// Rendering ----------------------------------------------------------------------------------------


/**
 * [DEBUG] Renders an outline of the box containing all legal move highlights.
 * Will only be visible if camera debug mode is on, as this is normally outside of the screen edge.
 */
function renderOutlineofRenderBox(): void {
	// const color: Color = [1,0,1, 1]; // Magenta
	const color: Color = [0.65,0.15,0, 1]; // Maroon (matches light brown wood theme)
	const data = meshes.RectWorld(boundingBoxOfRenderRange!, color);

	createModel(data, 2, "LINE_LOOP", true).render();
}

/**
 * [DEBUG] Renders an outline of the provided floating point bounding box.
 */
function renderOutlineofFloatingBox(box: BoundingBoxBD): void {
	const color: Color = [0.65,0.15,0, 1];
	const { left, right, bottom, top } = meshes.applyWorldTransformationsToBoundingBox(box);
	const data = primitives.Rect(left, bottom, right, top, color);

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
	genModelForRays,
	// Rendering
	renderOutlineofRenderBox,
	renderOutlineofFloatingBox,
};