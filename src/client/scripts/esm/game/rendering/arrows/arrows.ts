
/**
 * This script calculates and renders the arrow indicators
 * on the sides of the screen, pointing to pieces off-screen
 * that are in that direction.
 * 
 * If the pictues are clicked, we initiate a teleport to that piece.
 */

import type { BufferModel, BufferModelInstanced } from '../buffermodel.js';
import type { Coords, CoordsKey } from '../../../chess/util/coordutil.js';
import type { Piece } from '../../../chess/logic/boardchanges.js';
import type { Color } from '../../../chess/util/colorutil.js';
import type { BoundingBox, Corner, Vec2, Vec2Key } from '../../../util/math.js';
import type { LineKey, LinesByStep, PieceLinesByKey } from '../../../chess/logic/organizedlines.js';
// @ts-ignore
import type gamefile from '../../../chess/logic/gamefile.js';
// @ts-ignore
import type { LegalMoves } from '../../chess/selection.js';

import spritesheet from '../spritesheet.js';
import gameslot from '../../chess/gameslot.js';
import guinavigation from '../../gui/guinavigation.js';
import guigameinfo from '../../gui/guigameinfo.js';
import { createModel } from '../buffermodel.js';
import colorutil from '../../../chess/util/colorutil.js';
import jsutil from '../../../util/jsutil.js';
import coordutil from '../../../chess/util/coordutil.js';
import math from '../../../util/math.js';
import organizedlines from '../../../chess/logic/organizedlines.js';
import gamefileutility from '../../../chess/util/gamefileutility.js';
import legalmovehighlights from '../highlights/legalmovehighlights.js';
import onlinegame from '../../misc/onlinegame/onlinegame.js';
import frametracker from '../frametracker.js';
// @ts-ignore
import bufferdata from '../bufferdata.js';
// @ts-ignore
import legalmoves from '../../../chess/logic/legalmoves.js';
// @ts-ignore
import input from '../../input.js';
// @ts-ignore
import perspective from '../perspective.js';
// @ts-ignore
import transition from '../transition.js';
// @ts-ignore
import movement from '../movement.js';
// @ts-ignore
import options from '../options.js';
// @ts-ignore
import selection from '../../chess/selection.js';
// @ts-ignore
import camera from '../camera.js';
// @ts-ignore
import board from '../board.js';
// @ts-ignore
import moveutil from '../../../chess/util/moveutil.js';
// @ts-ignore
import space from '../../misc/space.js';
import arrowlegalmovehighlights from './arrowlegalmovehighlights.js';


// Type Definitions --------------------------------------------------------------------



/**
 * An object storing an object for every slide direction / line of the game.
 * And in that object are objects for each line on the plane of that slide direction.
 * And in each of those objects are stored pieces that have a chance of receiving
 * an arrow for them this frame, depending on the mode,
 * and a boolean indicating whether they can legally slide onto the screen area.
 */
interface SlideArrowsDraft {
	/** An object containing all existing arrows for a specific slide direction */
	[vec2Key: Vec2Key]: {
		/**
		 * A single line containing what arrows should be visible on the
		 * sides of the screen for offscreen pieces.
		 */
		[lineKey: string]: ArrowsLineDraft
	}
}

/**
 * An object containing the arrows that should actually be present,
 * for a single organized line intersecting through our screen.
 * 
 * The FIRST index in each of these left/right arrays, is the picture
 * which gets rendered at the default location.
 * The FINAL index in each of these, is the picture of the piece
 * that is CLOSEST to you (or the screen) on the line!
 */
interface ArrowsLineDraft {
	/** Piece on this line that intersect the screen with a positive dot product. */
	posDotProd: ArrowDraft[],
	/** Piece on this line that intersect the screen with a negative dot product.
	 * The arrow direction for these will be flipped to the other side. */
	negDotProd: ArrowDraft[],
	/** An array of the points this line intersects the screen bounding box
	 * in order of ascending dot product. */
	intersections: Coords[],
}

type ArrowDraft = { piece: Piece, canSlideOntoScreen: boolean };







interface SlideArrows {
	/** An object containing all existing arrows for a specific slide direction */
	[vec2Key: Vec2Key]: {
		/**
		 * A single line containing what arrows ARE visible on the
		 * sides of the screen for offscreen pieces.
		 */
		[lineKey: string]: ArrowsLine
	}
}

/**
 * An object containing the arrows that should actually be present,
 * for a single organized line intersecting through our screen.
 * 
 * The FIRST index in each of these left/right arrays, is the picture
 * which gets rendered at the default location.
 * The FINAL index in each of these, is the picture of the piece
 * that is CLOSEST to you (or the screen) on the line!
 */
interface ArrowsLine {
	/** Piece on this line that intersect the screen with a positive dot product.
	 * SORTED in order of closest to the screen to farthest. */
	posDotProd: Arrow[],
	/** Piece on this line that intersect the screen with a negative dot product.
	 * SORTED in order of closest to the screen to farthest.
	 * The arrow direction for these will be flipped to the other side. */
	negDotProd: Arrow[]
}

interface Arrow {
	worldLocation: Coords,
	piece: Piece,
	hovered: boolean,
}












// Variables ----------------------------------------------------------------------------


/** The width of the mini images of the pieces and arrows, in percentage of 1 tile. */
const width: number = 0.65;
/** How much padding to include between the mini image of the pieces & arrows and the edge of the screen, in percentage of 1 tile. */
const sidePadding: number = 0.15; // Default: 0.15   0.1 Lines up the tip of the arrows right against the edge
/** How much separation between adjacent pictures pointing to multiple pieces on the same line, in percentage of 1 tile. */
const paddingBetwAdjacentPictures: number = 0.35;
/** Opacity of the mini images of the pieces and arrows. */
const opacity: number = 0.6;
/** When we're zoomed out far enough that 1 tile is as wide as this many virtual pixels, we don't render the arrow indicators. */
const renderZoomLimitVirtualPixels: number = 10; // virtual pixels. Default: 14

/** The distance in perspective mode to render the arrow indicators from the camera.
 * We need this because there is no normal edge of the screen like in 2D mode. */
const perspectiveDist = 17;


/**
 * The mode the arrow indicators on the edges of the screen is currently in.
 * 0 = Off,
 * 1 = Defense,
 * 2 = All (orthogonals & diagonals)
 * 3 = All (including hippogonals, only used in variants using hippogonals)
 */
let mode: 0 | 1 | 2 | 3 = 1;


interface HoveredArrow {
	/**
	 * The slide direction / slope / step for this arrow.
	 * Is the same as the direction the arrow is pointing.
	 */
	// slideDir: Vec2,
	/** The key of the organized line that it is on */
	// lineKey: LineKey,
	/** A reference to the piece it is pointing to */
	piece: Piece
}

/**
 * A list of all arrows being hovered over this frame.
 * Other scripts may access this so they can add interaction with them.
 */
const hoveredArrows: HoveredArrow[] = [];

/**
 * A list of all arrows present for the current frame.
 * 
 * Other scripts need to be given an opportunity to add/remove
 * arrows from this list.
 */
// const arrowsData: Arrow[] = [];
let slideArrows: SlideArrows = {};


/** 
 * Returns the last stage of arrows updating/rendering.
 * OTHER SCRIPTS SHOULD ONLY REQUEST the hovered arrows list
 * and add/remove arrows after the update stage!!!
 * 
 * 0 = We updated last
 * 1 = We rendered last
 */
let stage: 0 | 1 = 1;


// Functions ------------------------------------------------------------------------------


/**
 * Returns the mode the arrow indicators on the edges of the screen is currently in.
 */
function getMode(): typeof mode {
	return mode;
}

/**
 * Sets the rendering mode of the arrow indicators on the edges of the screen.
 */
function setMode(value: typeof mode) {
	mode = value;
	if (mode === 0) arrowlegalmovehighlights.reset(); // Erase, otherwise their legal move highlights continue to render
}

/** Rotates the current mode of the arrow indicators. */
function toggleArrows() {
	frametracker.onVisualChange();
	// Have to do it weirdly like this, instead of using '++', because typescript complains that nextMode is of type number.
	let nextMode: typeof mode = mode === 0 ? 1 : mode === 1 ? 2 : mode === 2 ? 3 : /* mode === 3 ? */ 0;
	// Calculate the cap
	const cap = gameslot.getGamefile()!.startSnapshot.hippogonalsPresent ? 3 : 2;
	if (nextMode > cap) nextMode = 0; // Wrap back to zero
	setMode(nextMode);
}

function getHoveredArrows(): HoveredArrow[] {
	if (stage === 1) throw Error('should not be accessing hovered arrows after rendering is finished or before the update stage!');
	return hoveredArrows;
}



/**
 * Calculates what arrows should be visible this frame.
 * 
 * Needs to be done every frame, even if the mouse isn't moved,
 * since actions such as rewinding/forwarding may change them,
 * or board velocity.
 * 
 * DOES NOT GENERATE THE MODEL OF THE hovered arrow legal moves.
 * This is so that other script have the opportunity to modify the list of
 * visible arrows before rendering.
 */
function update() {
	stage = 0;
	if (mode === 0) return; // Arrow indicators are off, nothing is visible.
	if (board.gtileWidth_Pixels(true) < renderZoomLimitVirtualPixels) { // Too zoomed out, the arrows would be really tiny.
		arrowlegalmovehighlights.reset();
		return;
	}

	/**
	 * To be able to test if a piece is offscreen or not,
	 * we need to know the bounding box of the visible board.
	 * 
	 * Even if a tiny portion of the square the piece is on
	 * is visible on screen, we will not create an arrow for it.
	 */
	const { boundingBoxInt, boundingBoxFloat } = getBoundingBoxesOfVisibleScreen();

	/**
	 * Next, we are going to iterate through each slide existing in the game,
	 * and for each of them, iterate through all organized lines of that slope,
	 * for each one of those lines, if they intersect our screen bounding box,
	 * we will iterate through all its pieces, adding an arrow for them
	 * ONLY if they are not visible on screen...
	 */

	/** The object that stores all arrows that should be visible this frame. */
	const slideArrows: SlideArrowsDraft = generateAllArrows(boundingBoxInt, boundingBoxFloat);

	// If we are in only-show-attackers mode 
	removeUnnecessaryArrows(slideArrows);
	// console.log("Arrows after removing unnecessary:");
	// console.log(slideArrows);

	// Calculate what arrows are being hovered over...

	// First we need to add the additional padding to the bounding box,
	// so that the arrows aren't touching the screen edge.
	// addArrowsPaddingToBoundingBox(boundingBoxFloat);


	// Calc the model data...

	calculateInstanceData_AndArrowsHovered(slideArrows, boundingBoxFloat);
}

/**
 * Calculates the visible bounding box of the screen for this frame,
 * both the integer-rounded, and the exact floating point one.
 * 
 * These boxes are used to test whether a piece is visible on-screen or not.
 * As if it's not, it should get an arrow.
 */
function getBoundingBoxesOfVisibleScreen(): { boundingBoxInt: BoundingBox, boundingBoxFloat: BoundingBox } {
	// Same as above, but doesn't round
	const boundingBoxFloat: BoundingBox = perspective.getEnabled() ? board.generatePerspectiveBoundingBox(perspectiveDist) : board.gboundingBoxFloat();

	// Apply the padding of the navigation and gameinfo bars to the screen bounding box.
	if (!perspective.getEnabled()) { // Perspective is OFF
		let headerPad = space.convertPixelsToWorldSpace_Virtual(guinavigation.getHeightOfNavBar());
		let footerPad = space.convertPixelsToWorldSpace_Virtual(guigameinfo.getHeightOfGameInfoBar());
		// Reverse header and footer pads if we're viewing black's side
		if (!gameslot.isLoadedGameViewingWhitePerspective()) [headerPad, footerPad] = [footerPad, headerPad]; // Swap values
		// Apply the paddings to the bounding box
		boundingBoxFloat.top -= space.convertWorldSpaceToGrid(headerPad);
		boundingBoxFloat.bottom += space.convertWorldSpaceToGrid(footerPad);
	}

	// If any part of the square is on screen, this box rounds outward to contain it.
	const boundingBoxInt = board.roundAwayBoundingBox(boundingBoxFloat);

	return { boundingBoxInt, boundingBoxFloat };
}

/**
 * Adds a little bit of padding to the bounding box, so that the arrows of the
 * arrows indicators aren't touching the edge of the screen.
 * 
 * DESTRUCTIVE, modifies the provided BoundingBox.
 */
function addArrowsPaddingToBoundingBox(boundingBoxFloat: BoundingBox) {
	const padding = width / 2 + sidePadding;
	boundingBoxFloat.top -= padding;
	boundingBoxFloat.right -= padding;
	boundingBoxFloat.bottom += padding;
	boundingBoxFloat.left += padding;
}

/**
 * Generates all the arrows for a game, as if All (plus hippogonals) mode was on.
 */
function generateAllArrows(boundingBoxInt: BoundingBox, boundingBoxFloat: BoundingBox): SlideArrowsDraft {
	/** The running list of arrows that should be visible */
	const slideArrows: SlideArrowsDraft = {};
	const gamefile = gameslot.getGamefile()!;
	gamefile.startSnapshot.slidingPossible.forEach((slide: Vec2) => { // For each slide direction in the game...
		const slideKey = math.getKeyFromVec2(slide);

		// Find the 2 points on opposite sides of the bounding box
		// that will contain all organized lines of the given vector
		// intersecting the box between them.

		const containingPoints = math.findFarthestPointsALineSweepsABox(slide, boundingBoxInt);
		const containingPointsLineC = containingPoints.map(point => math.getLineCFromCoordsAndVec(point, slide)) as [number, number];
		// Any line of this slope of which its C value is not within these 2 are outside of our screen,
		// so no arrows will be visible for the piece.
		containingPointsLineC.sort((a, b) => a - b); // Sort them so C is ascending. Then index 0 will be the minimum and 1 will be the max.

		// For all our lines in the game with this slope...
		const organizedLinesOfDir = gamefile.piecesOrganizedByLines[slideKey];
		for (const lineKey of Object.keys(organizedLinesOfDir)) {
			// The C of the lineKey (`C|X`) with this slide at the very left & right sides of the screen.
			const C = organizedlines.getCFromKey(lineKey as LineKey);
			if (C < containingPointsLineC[0] || C > containingPointsLineC[1]) continue; // Next line, this one is off-screen, so no piece arrows are visible
			const organizedLine = organizedLinesOfDir[lineKey]!;
			// Calculate the ACTUAL arrows that should be visible for this specific organized line.
			const arrowsLine = calcArrowsLine(gamefile, boundingBoxInt, boundingBoxFloat, slide, slideKey, organizedLine as Piece[], lineKey as LineKey);
			// If it is empty, don't add it.
			if (arrowsLine.negDotProd.length === 0 && arrowsLine.posDotProd.length === 0) continue;
			if (!slideArrows[slideKey]) slideArrows[slideKey] = {}; // Make sure this exists first
			slideArrows[slideKey][lineKey] = arrowsLine; // Add this arrows line to our object containing all arrows for this frame
		}
	});

	return slideArrows;
}

/**
 * Calculates what arrows should be visible for a single
 * organized line of pieces intersecting our screen.
 * 
 * If the game contains ANY custom blocking functions, which would be true if we were
 * using the Huygens, then there could be a single arrow pointing to multiple pieces,
 * since the Huygens can phase through / skip over other pieces.
 */
function calcArrowsLine(gamefile: gamefile, boundingBoxInt: BoundingBox, boundingBoxFloat: BoundingBox, slideDir: Vec2, slideKey: Vec2Key, organizedline: Piece[], lineKey: LineKey): ArrowsLineDraft {

	const negDotProd: ArrowDraft[] = [];
	const posDotProd: ArrowDraft[] = [];

	/** The piece on the side that is closest to our screen. */
	let closestNegDotProd: ArrowDraft | undefined;
	/** The piece on the side that is closest to our screen. */
	let closestRightDotProd: ArrowDraft  | undefined;

	const axis = slideDir[0] === 0 ? 1 : 0;

	/**
	 * The 2 intersections points of the whole organized line, consistent for every piece on it.
	 * The only difference is each piece may have a different dot product,
	 * which just means it's on the opposite side.
	 */
	const intersections = math.findLineBoxIntersections(organizedline[0].coords, slideDir, boundingBoxInt).map(c => c.coords);
	if (intersections.length < 2) throw Error("Arrow line intersected screen box exactly on the corner!! Let's skip constructing this line.");

	organizedline.forEach(piece => {
		// Is the piece off-screen?
		if (math.boxContainsSquare(boundingBoxInt, piece.coords)) return; // On-screen, no arrow needed

		// Piece is guaranteed off-screen...
		
		/** The only way this differs from {@link intersections} is this may have unique dot products, depending on what side of the screen the piece is on. */
		const thisPieceIntersections = math.findLineBoxIntersections(piece.coords, slideDir, boundingBoxInt); // should THIS BE FLOAT???
		const positiveDotProduct = thisPieceIntersections[0]!.positiveDotProduct; // We know the dot product of both intersections will be identical, because the piece is off-screen.

		const entry: ArrowDraft = { piece, canSlideOntoScreen: false };

		// Update the piece that is closest to the screen box.
		if (positiveDotProduct) {
			if (closestNegDotProd === undefined) closestNegDotProd = entry;
			else if (piece.coords[axis] > closestNegDotProd.piece.coords[axis]) closestNegDotProd = entry;
		} else { // negativeDotProduct
			if (closestRightDotProd === undefined) closestRightDotProd = entry;
			else if (piece.coords[axis] < closestRightDotProd.piece.coords[axis]) closestRightDotProd = entry;
		}

		/**
		 * Calculate it's maximum slide.
		 * If it is able to slide (ignoring ignore function, and ignoring check respection)
		 * into our screen area, then it should be guaranteed an arrow,
		 * EVEN if it's not the closest piece to us on the line
		 * (which would mean it phased/skipped over pieces due to a custom blocking function)
		 */

		const slideLegalLimit = legalmoves.calcPiecesLegalSlideLimitOnSpecificLine(gamefile, piece, slideDir, slideKey, lineKey, organizedline);
		if (slideLegalLimit === undefined) return; // This piece can't slide along the direction of travel

		/**
		 * It CAN slide along our direction of travel...
		 * But can it slide far enough where it can reach our screen?
		 * 
		 * We already know the intersection points of its slide with the screen box.
		 * 
		 * Next, how do find test if it's legal slide protrudes into the screen?
		 * 
		 * All we do is test if the piece's distance to the furthest point it can
		 * slide is GREATER than its distance to the first intersection of the screen...
		 */

		// If the vector is in the opposite direction, then the first intersection is swapped
		const firstIntersection = positiveDotProduct ? thisPieceIntersections[0] : thisPieceIntersections[1];

		// What is the distance to the first intersection point?
		const firstIntersectionDist = math.chebyshevDistance(piece.coords, firstIntersection.coords);

		// What is the distance to the farthest point this piece can slide along this direction?
		let farthestSlidePoint: Coords = positiveDotProduct ? [
			piece.coords[0] + slideDir[0] * slideLegalLimit[1], // Multiply by the number of steps the piece can do in that direction
			piece.coords[1] + slideDir[1] * slideLegalLimit[1], // Multiply by the number of steps the piece can do in that direction
		] : [ // Negative dot product
			piece.coords[0] - slideDir[0] * slideLegalLimit[0], // Multiply by the number of steps the piece can do in that direction
			piece.coords[1] - slideDir[1] * slideLegalLimit[0], // Multiply by the number of steps the piece can do in that direction
		];
		// NaNs may occur if zero is multiplied by infinity. Make sure we replace each of those with zero.
		// (but it doesn't matter whether we replace it with zero, a finite number, or infinity, because
		// the chebyshev distance is gonna be infinity anyway, since the other coord is infinity)
		farthestSlidePoint = farthestSlidePoint.map(coord => isNaN(coord) ? 0 : coord) as Coords;
		const farthestSlidePointDist = math.chebyshevDistance(piece.coords, farthestSlidePoint);

		// If the farthest slide point distance is greater than the first intersection
		// distance, then the piece is able to slide into the screen bounding box!

		if (farthestSlidePointDist < firstIntersectionDist) return; // This piece cannot slide so far as to intersect the screen bounding box

		// This piece CAN slide far enough to enter our screen...
		entry.canSlideOntoScreen = true;

		// Add the piece to the arrow line
		if (positiveDotProduct)  negDotProd.push(entry);
		else /* Opposite side */ posDotProd.push(entry);
	});

	/**
	 * Add the closest left/right pieces if they haven't been added already
	 * (which would only be the case if they can slide onto our screen),
	 * And DON'T add them if they are a VOID square!
	 */
	if (closestNegDotProd   !== undefined && !negDotProd.includes(closestNegDotProd)   && closestNegDotProd.piece.type   !== 'voidsN') negDotProd.push(closestNegDotProd);
	if (closestRightDotProd !== undefined && !posDotProd.includes(closestRightDotProd) && closestRightDotProd.piece.type !== 'voidsN') posDotProd.push(closestRightDotProd);

	// Now sort them.
	negDotProd.sort((entry1, entry2) => entry1.piece.coords[axis] - entry2.piece.coords[axis]);
	posDotProd.sort((entry1, entry2) => entry2.piece.coords[axis] - entry1.piece.coords[axis]);
	// console.log(`Sorted left & right arrays of line of arrows for slideDir ${JSON.stringify(slideDir)}, lineKey ${lineKey}:`);
	// console.log(left);
	// console.log(right);

	return { negDotProd, posDotProd, intersections };
}

/**
 * Removes arrows based on the mode.
 * 
 * mode == 1: Removes arrows to ONLY include the pieces which can legally slide into our screen (which may include hippogonals)
 * mode == 2: Everything in mode 1, PLUS all orthogonals and diagonals, whether or not the piece can slide into our sreen
 * mode == 3: Everything in mode 1 & 2, PLUS all hippogonals, whether or not the piece can slide into our screen
 */
function removeUnnecessaryArrows(slideArrows: SlideArrowsDraft) {
	const gamefile = gameslot.getGamefile()!;
	if (mode === 3) return; // Don't remove anything

	let slideExceptions: Vec2Key[] = [];
	// If we're in mode 2, retain all orthogonals and diagonals, EVEN if they can't slide in that direction.
	if (mode === 2) {
		slideExceptions = gamefile.startSnapshot.slidingPossible.filter((slideDir: Vec2) => Math.max(Math.abs(slideDir[0]), Math.abs(slideDir[1])) === 1).map(math.getKeyFromVec2);
	}

	for (const direction in slideArrows) {
		if (slideExceptions.includes(direction as Vec2Key)) continue; // Keep it anyway, our arrows mode is high enough
		removeTypesThatCantSlideOntoScreen(slideArrows[direction as Vec2Key]!);
		if (jsutil.isEmpty(slideArrows[direction as Vec2Key]!)) delete slideArrows[direction as Vec2Key];
	}

	function removeTypesThatCantSlideOntoScreen(object: { [lineKey: LineKey]: ArrowsLineDraft }) { // horzRight, vertical/diagonalUp
		for (const key in object) { // LineKey
			const line: ArrowsLineDraft = object[key as LineKey]!;
			if (line.negDotProd.length > 0) {
				const entry: ArrowDraft = line.negDotProd[line.negDotProd.length - 1]!;
				if (!entry.canSlideOntoScreen) line.negDotProd.pop();
			}
			if (line.posDotProd.length > 0) {
				const entry: ArrowDraft = line.posDotProd[line.posDotProd.length - 1]!;
				if (!entry.canSlideOntoScreen) line.posDotProd.pop();
			}
			if (line.negDotProd.length === 0 && line.posDotProd.length === 0) delete object[key as LineKey];
		}
	}
}

/**
 * Calculates the world space coordinate of each arrow on screen,
 * the piece type,
 * the direction the arrow points,
 * the piece the arrow points to,
 * and constructs a list of all ARROWS (not pieces) being hovered over.
 */
function calculateInstanceData_AndArrowsHovered(slideArrowsDraft: SlideArrowsDraft, boundingBoxFloat: BoundingBox) {

	/**
	 * A running list of of piece arrows being hovered over this frame
	 * The ARROW, not the piece which the arrow is pointing to.
	 */
	if (Object.keys(slideArrows).length > 0) throw Error('SHOULD have erased all slide arrows before recalcing'); // DELETE LATER


	const worldWidth = width * movement.getBoardScale(); // The world-space width of our images
	const worldHalfWidth = worldWidth / 2;

	const mouseWorldLocation = input.getTouchClickedWorld() ? input.getTouchClickedWorld() : input.getMouseWorldLocation();

	// for (const vec2Key in slideArrowsDraft) {
	// 	const arrowLinesOfSlideDir = slideArrowsDraft[vec2Key as Vec2Key]!;
	// 	const slideDir = math.getVec2FromKey(vec2Key as Vec2Key);
	// 	for (const lineKey in arrowLinesOfSlideDir) { // `C|X`
	// 		arrowLinesOfSlideDir[lineKey]!.negDotProd.forEach((entry, index) => processPiece(vec2Key as Vec2Key, lineKey as LineKey, entry.piece, index, slideDir, true));
	// 		arrowLinesOfSlideDir[lineKey]!.posDotProd.forEach((entry, index) => processPiece(vec2Key as Vec2Key, lineKey as LineKey, entry.piece, index, slideDir, false));
	// 	}
	// }

	// Take the arrows draft, construct the actual
	for (const [vec2Key, linesOfDirectionDraft] of Object.entries(slideArrowsDraft)) {
		const slideDir = math.getVec2FromKey(vec2Key as Vec2Key);
		const linesOfDirection: { [lineKey: string]: ArrowsLine } = {};

		// Calculate the padding.
		const padding = width / 2 + sidePadding;
		const paddingXYComponents: Coords = math.calculateVectorComponents(slideDir, padding);

		const vector = slideDir;
		const negVector = math.negateVector(slideDir);
		
		let atleastOneLine = false;
		for (const [lineKey, arrowLineDraft] of Object.entries(linesOfDirectionDraft)) {
			
			const posDotProd: Arrow[] = [];
			const negDotProd: Arrow[] = [];
			
			(arrowLineDraft as ArrowsLineDraft).posDotProd.forEach((arrowDraft, index) => {
				const arrow = processPiece(arrowDraft, vector, paddingXYComponents, (arrowLineDraft as ArrowsLineDraft).intersections[0]!, true, index);
				if (arrow !== undefined) posDotProd.push(arrow);
			});

			(arrowLineDraft as ArrowsLineDraft).negDotProd.forEach((arrowDraft, index) => {
				const arrow = processPiece(arrowDraft, negVector, paddingXYComponents, (arrowLineDraft as ArrowsLineDraft).intersections[1]!, false, index);
				if (arrow !== undefined) negDotProd.push(arrow);
			});

			if (posDotProd.length > 0 || negDotProd.length > 0) {
				atleastOneLine = true;
				linesOfDirection[lineKey] = { posDotProd, negDotProd };
			}
		}
 
		if (atleastOneLine) slideArrows[vec2Key] = linesOfDirection;
	}


	// Calculates the world space center of the picture of the arrow, and tests if the mouse is hovering over.
	// Adds the arrow the the FINAL arrows, not the drafts.
	function processPiece(arrowDraft: ArrowDraft, vector: Vec2, paddingXYComponents: Coords, intersection: Coords, posDotProd: boolean, index: number): Arrow | undefined {
		const renderCoords = intersection;

		// Apply the padding
		const multiplier = posDotProd ? 1 : -1;
		renderCoords[0] += paddingXYComponents[0] * multiplier;
		renderCoords[1] += paddingXYComponents[1] * multiplier;
		
		// If this picture is an adjacent picture, adjust it's positioning
		if (index > 0) {
			renderCoords[0] += vector[0] * paddingBetwAdjacentPictures * index;
			renderCoords[1] += vector[1] * paddingBetwAdjacentPictures * index;
		}

		const worldLocation: Coords = space.convertCoordToWorldSpace(renderCoords) as Coords;

		// Does the mouse hover over the piece?
		let hovered = false;
		const chebyshevDist = math.chebyshevDistance(worldLocation, mouseWorldLocation);
		if (chebyshevDist < worldHalfWidth) { // Mouse inside the picture bounding box
			hovered = true;
			// ADD the piece to the list of arrows being hovered over!!!
			hoveredArrows.push({ piece: arrowDraft.piece });
			// If we also clicked, then teleport!
			teleportToPieceIfClicked(arrowDraft.piece, vector);
		}

		return { worldLocation, piece: arrowDraft.piece, hovered, };

		// arrowsData.push({ worldLocation, type: piece.type, slideDir, flipped: !posDotProd, hovered, isAdjacent });
	}

	// console.log("Arrows hovered over this frame:");
	// console.log(hoveredArrows);

	// console.log("Arrows instance data calculated this frame:");
	// console.log(arrowsData);
}



function teleportToPieceIfClicked(piece: Piece, vector: Vec2) {
	if (!input.isMouseDown_Left() && !input.getTouchClicked()) return; // Mouse did not click this frame

	// Teleport in the direction of the piece's arrow, NOT straight to the piece.

	const startCoords = movement.getBoardPos();
	// The direction we will follow when teleporting
	const line1GeneralForm = math.getLineGeneralFormFromCoordsAndVec(startCoords, vector);
	// The line perpendicular to the target piece
	const perpendicularSlideDir: Vec2 = [-vector[1], vector[0]]; // Rotates left 90deg
	const line2GeneralForm = math.getLineGeneralFormFromCoordsAndVec(piece.coords, perpendicularSlideDir);
	// The target teleport coords
	const telCoords = math.calcIntersectionPointOfLines(...line1GeneralForm, ...line2GeneralForm)!; // We know it will be defined because they are PERPENDICULAR

	transition.panTel(startCoords, telCoords);
	if (input.isMouseDown_Left()) input.removeMouseDown_Left();
}














function addArrow(piece: Piece) {

}



/**
 * 
 * @param coords - The coordinates of the piece to delete.
 * @param recalcHover - Whether, on the line affected by the removed piece, to recalculate if the mouse is hovering their new positions, and teleport if they were clicked.
 * This should be true if the piece being removed is the piece currently being animated,
 * but false if the piece being removed is being captured by a drag-drop.
 */
function removeArrow(coords: Coords, recalcHover: boolean) {

}














function render() {
	stage = 1;
	arrowlegalmovehighlights.update();
	regenerateModelAndRender();
}

function regenerateModelAndRender() {
	if (Object.keys(slideArrows).length === 0) return; // No visible arrows, don't generate the model

	const data: number[] = [];
	const dataArrows: number[] = [];

	// ADD THE DATA
	// ...

	const worldWidth = width * movement.getBoardScale(); // The world-space width of our images
	const halfWorldWidth = worldWidth / 2;

	for (const [key, value] of Object.entries(slideArrows)) {
		const vec2Key = key as Vec2Key;
		const slideLinesOfDirection = value as { [lineKey: string]: ArrowsLine };

		const slideDir = math.getVec2FromKey(vec2Key as Vec2Key);

		const vector = slideDir;
		const negVector = math.negateVector(slideDir);

		for (const value of Object.values(slideLinesOfDirection)) {
			const slideLine = value as ArrowsLine;

			slideLine.posDotProd.forEach((arrow, index) => concatData(data, dataArrows, arrow, vector, index, worldWidth, halfWorldWidth));
			slideLine.negDotProd.forEach((arrow, index) => concatData(data, dataArrows, arrow, negVector, index, worldWidth, halfWorldWidth));
		}
	}


	/** The buffer model of the piece mini images on
	 * the edge of the screen. **Doesn't include** the little arrows. */
	const modelPictures = createModel(data, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
	/** The buffer model of the little arrows on
	 * the edge of the screen next to the mini piece images. */
	const modelArrows = createModel(dataArrows, 2, "TRIANGLES", true);

	modelPictures.render();
	modelArrows.render();

	// Reset lists for next frame
	slideArrows = {};
	hoveredArrows.length = 0;
}


/**
 * Takes an arrow, generates the vertex data of both the PICTURE and ARROW,
 * and appends them to their respective vertex data arrays.
 * */
function concatData(data: number[], dataArrows: number[], arrow: Arrow, vector: Vec2, index: number, worldWidth: number, halfWorldWidth: number) {

	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(arrow.piece.type, rotation);

	const startX = arrow.worldLocation[0] - halfWorldWidth;   
	const startY = arrow.worldLocation[1] - halfWorldWidth;
	const endX = startX + worldWidth;
	const endY = startY + worldWidth;

	// Color
	const { r, g, b } = options.getColorOfType(arrow.piece.type);
	// Are we hovering over? If so, opacity needs to be 100%
	const a = arrow.hovered ? 1 : opacity;

	// Opacity changing with distance
	// let maxAxisDist = math.chebyshevDistance(movement.getBoardPos(), pieceCoords) - 8;
	// opacity = Math.sin(maxAxisDist / 40) * 0.5

	const thisData = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texleft, texbottom, texright, textop, r, g, b, a);

	data.push(...thisData);

	// Next append the data of the little arrow!

	if (index > 0) return; // We can skip, since it is an adjacent picture!

	const dist = halfWorldWidth * 1;
	const size = 0.3 * halfWorldWidth;
	const points: Coords[] = [
        [dist, -size],
        [dist, +size],
        [dist + size, 0]
    ];

	const angle = Math.atan2(vector[1], vector[0]);
	const ad = applyTransform(points, angle, arrow.worldLocation);

	for (let i = 0; i < ad.length; i++) {
		const thisPoint = ad[i]!;
		//                   x             y          color
		dataArrows.push(thisPoint[0], thisPoint[1], 0,0,0,a );
	}
}

/**
 * Applies a rotational & translational transformation to an array of points.
 * 
 * TODO: Move to maybe bufferdata?
 */
function applyTransform(points: Coords[], rotation: number, translation: Coords): Coords[] {
	// convert rotation angle to radians
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
    
	// apply rotation matrix and translation vector to each point
	const transformedPoints: Coords[] = points.map(point => {
		const xRot = point[0] * cos - point[1] * sin;
		const yRot = point[0] * sin + point[1] * cos;
		const xTrans = xRot + translation[0];
		const yTrans = yRot + translation[1];
		return [xTrans, yTrans];
	});
    
	// return transformed points as an array of length-2 arrays
	return transformedPoints;
}
















export default {
	getMode,
	setMode,
	toggleArrows,
	getHoveredArrows,
	update,
	render,
};