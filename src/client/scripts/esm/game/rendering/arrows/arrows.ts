
/**
 * This script calculates and renders the arrow indicators
 * on the sides of the screen, pointing to pieces off-screen
 * that are in that direction.
 * 
 * If the pictures are clicked, we initiate a teleport to that piece.
 * 
 * Other scripts may add/remove arrows in between update() and render() calls.
 */

import type { Coords } from '../../../chess/util/coordutil.js';
import type { BoundingBox, Vec2, Vec2Key } from '../../../util/math.js';
import type { LineKey } from '../../../chess/util/boardutil.js';
import type { Piece } from '../../../chess/util/boardutil.js';
import type { AttributeInfoInstanced } from '../buffermodel.js';
import type { Change } from '../../../chess/logic/boardchanges.js';
import type { Board } from '../../../chess/logic/gamefile.js';

import spritesheet from '../spritesheet.js';
import gameslot from '../../chess/gameslot.js';
import guinavigation from '../../gui/guinavigation.js';
import guigameinfo from '../../gui/guigameinfo.js';
import { createModel_Instanced_GivenAttribInfo } from '../buffermodel.js';
import jsutil from '../../../util/jsutil.js';
import coordutil from '../../../chess/util/coordutil.js';
import math from '../../../util/math.js';
import organizedpieces from '../../../chess/logic/organizedpieces.js';
import typeutil from '../../../chess/util/typeutil.js';
import frametracker from '../frametracker.js';
import arrowlegalmovehighlights from './arrowlegalmovehighlights.js';
import space from '../../misc/space.js';
import boardutil from '../../../chess/util/boardutil.js';
import { rawTypes } from '../../../chess/util/typeutil.js';
import boardchanges from '../../../chess/logic/boardchanges.js';
import { listener_overlay } from '../../chess/game.js';
import { InputListener, Mouse, MouseButton } from '../../input.js';
import mouse from '../../../util/mouse.js';
import boardpos from '../boardpos.js';
import legalmoves from '../../../chess/logic/legalmoves.js';
// @ts-ignore
import bufferdata from '../bufferdata.js';
// @ts-ignore
import perspective from '../perspective.js';
// @ts-ignore
import transition from '../transition.js';
// @ts-ignore
import boardtiles from '../boardtiles.js';
// @ts-ignore
import shapes from '../shapes.js';


// Type Definitions --------------------------------------------------------------------


/**
 * An object containing all the arrow lines of a single frame,
 * BEFORE removing access arrows due to our mode.
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
 * for a single organized line intersecting through our screen,
 * BEFORE removing access arrows due to our mode.
 * 
 * The FIRST index in each of these left/right arrays, is the picture
 * which gets rendered at the default location.
 * The FINAL index in each of these, is the picture of the piece
 * that is CLOSEST to you (or the screen) on the line!
 */
interface ArrowsLineDraft {
	/** Pieces on this line that intersect the screen with a positive dot product.
	 * SORTED in order of closest to the screen to farthest. */
	posDotProd: ArrowDraft[],
	/** Pieces on this line that intersect the screen with a negative dot product.
	 * SORTED in order of closest to the screen to farthest.
	 * The arrow direction for these will be flipped to the other side. */
	negDotProd: ArrowDraft[],
	/** An array of the points this line intersects the screen bounding box,
	 * in order of ascending dot product. */
	intersections: [Coords, Coords],
}

/** A single arrow indicator DRAFT. This may be removed depending on our mode. */
type ArrowDraft = { piece: Piece, canSlideOntoScreen: boolean };

/**
 * An object containing all the arrow lines of a single frame.
 */
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
	/** Pieces on this line that intersect the screen with a positive dot product.
	 * SORTED in order of closest to the screen to farthest. */
	posDotProd: Arrow[],
	/** Pieces on this line that intersect the screen with a negative dot product.
	 * SORTED in order of closest to the screen to farthest.
	 * The arrow direction for these will be flipped to the other side. */
	negDotProd: Arrow[]
}

/** A single arrow indicator, with enough information to be able to render it. */
interface Arrow {
	worldLocation: Coords,
	piece: Piece,
	/** Whether the arrow is being hovered over by the mouse */
	hovered: boolean,
}

/** Animated arrows are treated separately, we also need to know their direction. */
interface AnimatedArrow extends Arrow { direction: Vec2 }

/** An arrow that is being hovered over this frame */
interface HoveredArrow {
	/** A reference to the piece it is pointing to */
	piece: Piece
	/**
	 * The slide direction / slope / step for this arrow.
	 * Is the same as the direction the arrow is pointing.
	 * Negated is auto-negated when applicable.
	 */
	vector: Vec2,
}


// Variables ----------------------------------------------------------------------------

/** The maximum number of pieces in a game before we disable arrow indicator rendering, for performance. */
const pieceCountToDisableArrows = 50_000;
/** The maximum number of lines in a game before we disable arrow indicator rendering, for performance. */
const lineCountToDisableArrows = 8;

/** The width of the mini images of the pieces and arrows, in percentage of 1 tile. */
const width: number = 0.65;
/** How much padding to include between the mini image of the pieces & arrows and the edge of the screen, in percentage of 1 tile. */
const sidePadding: number = 0.15; // Default: 0.15   0.1 Lines up the tip of the arrows right against the edge
/** How much separation between adjacent pictures pointing to multiple pieces on the same line, in percentage of 1 tile. */
const paddingBetwAdjacentPictures: number = 0.35;
/** Opacity of the mini images of the pieces and arrows. */
const opacity: number = 0.6;
/** When we're zoomed out far enough that 1 tile is as wide as this many virtual pixels, we don't render the arrow indicators. */
const renderZoomLimitVirtualPixels: number = 12; // virtual pixels. Default: 20

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


/**
 * The bounding box of the screen for this frame.
 */
let boundingBoxFloat: BoundingBox | undefined;
/**
 * The bounding box of the screen for this frame,
 * rounded outward to contain the entirity of
 * any square even partially visible.
 */
let boundingBoxInt: BoundingBox | undefined;


/**
 * A list of all arrows being hovered over this frame,
 * with a reference to the piece they are pointing to.
 * Other scripts may access this so they can add interaction with them.
 */
const hoveredArrows: HoveredArrow[] = [];

/**
 * A list of all arrows present for the current frame.
 * 
 * Other scripts are given an opportunity to add/remove
 * arrows from this list before rendering, but they must
 * do so between the update() and render() calls.
 */
let slideArrows: SlideArrows = {};

/**
 * A list of all animated arrows IN MOTION for the current frame.
 * 
 * This does not include still ones, for exmpale rendered from
 * the piece captured being rendered in place.
 * Still animation's lines are recalculated manually.
 */
const animatedArrows: AnimatedArrow[] = [];


// Utility ------------------------------------------------------------------------------


/**
 * Returns the mode the arrow indicators on the edges of the screen is currently in.
 */
function getMode(): typeof mode {
	return mode;
}

/**
 * Resets the arrows lists in prep for the next frame.
 */
function reset() {
	slideArrows = {};
	animatedArrows.length = 0;
	hoveredArrows.length = 0;
	boundingBoxFloat = undefined;
	boundingBoxInt = undefined;
	shifts.length = 0;
}

/**
 * Sets the rendering mode of the arrow indicators on the edges of the screen.
 */
function setMode(value: typeof mode) {
	mode = value;
	if (mode === 0) {
		reset();
		arrowlegalmovehighlights.reset(); // Erase, otherwise their legal move highlights continue to render
	}
}

/** Rotates the current mode of the arrow indicators. */
function toggleArrows() {
	frametracker.onVisualChange();
	// Have to do it weirdly like this, instead of using '++', because typescript complains that nextMode is of type number.
	let nextMode: typeof mode = mode === 0 ? 1 : mode === 1 ? 2 : mode === 2 ? 3 : /* mode === 3 ? */ 0;
	// Calculate the cap
	const cap = gameslot.getGamefile()!.boardsim.pieces.hippogonalsPresent ? 3 : 2;
	if (nextMode > cap) nextMode = 0; // Wrap back to zero
	setMode(nextMode);
}

/**
 * Returns the list of arrow indicators hovered over this frame,
 * with references to the piece they are pointing to.
 * 
 * MUST be called after the update() method!
 */
function getHoveredArrows(): HoveredArrow[] {
	return hoveredArrows;
}

function areHoveringAtleastOneArrow(): boolean {
	return hoveredArrows.length > 0;
}


// Updating -----------------------------------------------------------------------------------------------------------


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
	reset(); // Initiate the arrows empty
	if (!areArrowsActiveThisFrame()) { // Arrow indicators are off, nothing is visible.
		arrowlegalmovehighlights.reset(); // Also reset this
		return;
	}

	/**
	 * To be able to test if a piece is offscreen or not,
	 * we need to know the bounding box of the visible board.
	 * 
	 * Even if a tiny portion of the square the piece is on
	 * is visible on screen, we will not create an arrow for it.
	 */
	updateBoundingBoxesOfVisibleScreen();

	/**
	 * Next, we are going to iterate through each slide existing in the game,
	 * and for each of them, iterate through all organized lines of that slope,
	 * for each one of those lines, if they intersect our screen bounding box,
	 * we will iterate through all its pieces, adding an arrow for them
	 * ONLY if they are not visible on screen...
	 */

	/** The object that stores all arrows that should be visible this frame. */
	const slideArrowsDraft: SlideArrowsDraft = generateArrowsDraft(boundingBoxInt!, boundingBoxFloat!);

	// Remove arrows based on our mode
	removeUnnecessaryArrows(slideArrowsDraft);
	// console.log("Arrows after removing unnecessary:");
	// console.log(slideArrows);

	// Calc the more detailed information required about each arrow,
	// since we've now removed all the ones not visible.

	calculateSlideArrows_AndHovered(slideArrowsDraft);
}

/** Whether the arrows should be calculated and rendered this frame */
function areArrowsActiveThisFrame() {
	// false if the arrows are off, or if the board is too zoomed out
	return mode !== 0 && boardtiles.gtileWidth_Pixels() >= renderZoomLimitVirtualPixels;
}

/**
 * Calculates the visible bounding box of the screen for this frame,
 * both the integer-rounded, and the exact floating point one.
 * 
 * These boxes are used to test whether a piece is visible on-screen or not.
 * As if it's not, it should get an arrow.
 */
function updateBoundingBoxesOfVisibleScreen() {
	// Same as above, but doesn't round
	boundingBoxFloat = perspective.getEnabled() ? boardtiles.generatePerspectiveBoundingBox(perspectiveDist) : boardtiles.gboundingBoxFloat();

	// Apply the padding of the navigation and gameinfo bars to the screen bounding box.
	if (!perspective.getEnabled()) { // Perspective is OFF
		let headerPad = space.convertPixelsToWorldSpace_Virtual(guinavigation.getHeightOfNavBar());
		let footerPad = space.convertPixelsToWorldSpace_Virtual(guigameinfo.getHeightOfGameInfoBar());
		// Reverse header and footer pads if we're viewing black's side
		if (!gameslot.isLoadedGameViewingWhitePerspective()) [headerPad, footerPad] = [footerPad, headerPad]; // Swap values
		// Apply the paddings to the bounding box
		boundingBoxFloat!.top -= space.convertWorldSpaceToGrid(headerPad);
		boundingBoxFloat!.bottom += space.convertWorldSpaceToGrid(footerPad);
	}

	// If any part of the square is on screen, this box rounds outward to contain it.
	boundingBoxInt = boardtiles.roundAwayBoundingBox(boundingBoxFloat);
	// Expand the bounding box so that it contains the whole of the squares.
	boundingBoxInt = shapes.expandTileBoundingBoxToEncompassWholeSquare(boundingBoxInt);

	/**
	 * Adds a little bit of padding to the bounding box, so that the arrows of the
	 * arrows indicators aren't touching the edge of the screen.
	 */
	const padding = width / 2 + sidePadding;
	boundingBoxFloat!.top -= padding;
	boundingBoxFloat!.right -= padding;
	boundingBoxFloat!.bottom += padding;
	boundingBoxFloat!.left += padding;
}

/**
 * Generates a draft of all the arrows for a game, as if All (plus hippogonals) mode was on.
 * This contains minimal information, as some may be removed later.
 */
function generateArrowsDraft(boundingBoxInt: BoundingBox, boundingBoxFloat: BoundingBox): SlideArrowsDraft {
	/** The running list of arrows that should be visible */
	const slideArrowsDraft: SlideArrowsDraft = {};
	const gamefile = gameslot.getGamefile()!;
	gamefile.boardsim.pieces.slides.forEach((slide: Vec2) => { // For each slide direction in the game...
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
		const organizedLinesOfDir = gamefile.boardsim.pieces.lines.get(slideKey)!;
		for (const [lineKey, organizedLine] of organizedLinesOfDir) {
			// The C of the lineKey (`C|X`) with this slide at the very left & right sides of the screen.
			const C = organizedpieces.getCFromKey(lineKey as LineKey);
			if (C < containingPointsLineC[0] || C > containingPointsLineC[1]) continue; // Next line, this one is off-screen, so no piece arrows are visible

			// Calculate the ACTUAL arrows that should be visible for this specific organized line.
			const arrowsLine = calcArrowsLineDraft(gamefile.boardsim, boundingBoxInt, boundingBoxFloat, slide, slideKey, organizedLine);
			if (arrowsLine === undefined) continue;
			if (!slideArrowsDraft[slideKey]) slideArrowsDraft[slideKey] = {}; // Make sure this exists first
			slideArrowsDraft[slideKey][lineKey] = arrowsLine; // Add this arrows line to our object containing all arrows for this frame
		}
	});

	return slideArrowsDraft;
}

/**
 * Calculates what arrows should be visible for a single
 * organized line of pieces intersecting our screen.
 * 
 * In a game with Huygens, there may be multiple arrows
 * next to each other one the same line, since Huygens
 * can jump/skip over other pieces.
 */
function calcArrowsLineDraft(boardsim: Board, boundingBoxInt: BoundingBox, boundingBoxFloat: BoundingBox, slideDir: Vec2, slideKey: Vec2Key, organizedline: number[]): ArrowsLineDraft | undefined {

	const negDotProd: ArrowDraft[] = [];
	const posDotProd: ArrowDraft[] = [];

	/** The piece on the side that is closest to our screen. */
	let closestPosDotProd: ArrowDraft | undefined;
	/** The piece on the side that is closest to our screen. */
	let closestNegDotProd: ArrowDraft | undefined;

	const axis = slideDir[0] === 0 ? 1 : 0;

	const firstPiece = boardutil.getPieceFromIdx(boardsim.pieces, organizedline[0]!)!;

	/**
	 * The 2 intersections points of the whole organized line, consistent for every piece on it.
	 * The only difference is each piece may have a different dot product,
	 * which just means it's on the opposite side.
	 */
	const intersections = math.findLineBoxIntersections(firstPiece.coords, slideDir, boundingBoxFloat).map(c => c.coords);
	if (intersections.length < 2) return; // Arrow line intersected screen box exactly on the corner!! Let's skip constructing this line. No arrow will be visible

	organizedline.forEach(idx => {
		const piece = boardutil.getPieceFromIdx(boardsim.pieces, idx)!;

		// Is the piece off-screen?
		if (math.boxContainsSquare(boundingBoxInt, piece.coords)) return; // On-screen, no arrow needed

		// Piece is guaranteed off-screen...
		
		// console.log(boundingBoxFloat, boundingBoxInt) 
		const thisPieceIntersections = math.findLineBoxIntersections(piece.coords, slideDir, boundingBoxInt); // should THIS BE FLOAT???
		if (thisPieceIntersections.length < 2) return; // RARE BUG. I think this is a failure of findLineBoxIntersections(). Just skip the piece when this happens.
		const positiveDotProduct = thisPieceIntersections[0]!.positiveDotProduct; // We know the dot product of both intersections will be identical, because the piece is off-screen.

		const arrowDraft: ArrowDraft = { piece, canSlideOntoScreen: false };

		// Update the piece that is closest to the screen box.
		if (positiveDotProduct) {
			if (closestPosDotProd === undefined) closestPosDotProd = arrowDraft;
			else if (piece.coords[axis] > closestPosDotProd.piece.coords[axis]) closestPosDotProd = arrowDraft;
		} else { // negativeDotProduct
			if (closestNegDotProd === undefined) closestNegDotProd = arrowDraft;
			else if (piece.coords[axis] < closestNegDotProd.piece.coords[axis]) closestNegDotProd = arrowDraft;
		}

		/**
		 * Calculate it's maximum slide.
		 * 
		 * If it is able to slide (ignoring ignore function, and ignoring check respection)
		 * into our screen area, then it should be guaranteed an arrow,
		 * EVEN if it's not the closest piece to us on the line
		 * (which would mean it phased/skipped over pieces due to a custom blocking function)
		 */

		const slideLegalLimit = legalmoves.calcPiecesLegalSlideLimitOnSpecificLine(boardsim, piece, slideDir, slideKey, organizedline);
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
		const firstIntersection = positiveDotProduct ? thisPieceIntersections[0]! : thisPieceIntersections[1]!;

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
		arrowDraft.canSlideOntoScreen = true;

		// Add the piece to the arrow line
		if (positiveDotProduct)  posDotProd.push(arrowDraft);
		else /* Opposite side */ negDotProd.push(arrowDraft);
	});

	/**
	 * Add the closest left/right pieces if they haven't been added already
	 * (which would only be the case if they can slide onto our screen),
	 * And DON'T add them if they are a VOID square!
	 */
	if (closestPosDotProd !== undefined && !posDotProd.includes(closestPosDotProd) && typeutil.getRawType(closestPosDotProd.piece.type) !== rawTypes.VOID) posDotProd.push(closestPosDotProd);
	if (closestNegDotProd !== undefined && !negDotProd.includes(closestNegDotProd) && typeutil.getRawType(closestNegDotProd.piece.type) !== rawTypes.VOID) negDotProd.push(closestNegDotProd);

	if (posDotProd.length === 0 && negDotProd.length === 0) return; // If both are empty, return undefined

	// Now sort them.
	posDotProd.sort((entry1, entry2) => entry1.piece.coords[axis] - entry2.piece.coords[axis]);
	negDotProd.sort((entry1, entry2) => entry2.piece.coords[axis] - entry1.piece.coords[axis]);
	// console.log(`Sorted left & right arrays of line of arrows for slideDir ${JSON.stringify(slideDir)}, lineKey ${lineKey}:`);
	// console.log(left);
	// console.log(right);

	return { negDotProd, posDotProd, intersections: intersections as [Coords, Coords] };
}

/**
 * Removes arrows based on the mode.
 * 
 * mode == 1: Removes arrows to ONLY include the pieces which can legally slide into our screen (which may include hippogonals)
 * mode == 2: Everything in mode 1, PLUS all orthogonals and diagonals, whether or not the piece can slide into our sreen
 * mode == 3: Everything in mode 1 & 2, PLUS all hippogonals, whether or not the piece can slide into our screen
 */
function removeUnnecessaryArrows(slideArrowsDraft: SlideArrowsDraft) {
	if (mode === 3) return; // Don't remove anything

	const slideExceptions = getSlideExceptions();

	for (const direction in slideArrowsDraft) {
		if (slideExceptions.includes(direction as Vec2Key)) continue; // Keep it anyway, our arrows mode is high enough
		// Remove types that can't slide onto the screen...
		const arrowsByDir = slideArrowsDraft[direction as Vec2Key];
		for (const key in arrowsByDir) { // LineKey
			const line: ArrowsLineDraft = arrowsByDir[key]!;
			removeTypesThatCantSlideOntoScreenFromLineDraft(line);
			if (line.negDotProd.length === 0 && line.posDotProd.length === 0) delete arrowsByDir[key as LineKey];
		}
		if (jsutil.isEmpty(slideArrowsDraft[direction as Vec2Key]!)) delete slideArrowsDraft[direction as Vec2Key];
	}
}

/** Checks if a single animated arrow is needed, based on our current mode, and its direction. */
function isAnimatedArrowUnnecessary(boardsim: Board, type: number, direction: Vec2, dirKey: Vec2Key): boolean {
	if (mode === 3) return false; // Keep it, whether hippogonal orthogonal or diagonal
	if (mode === 2) return math.chebyshevDistance([0,0], direction) !== 1; // Only keep orthogonals and diagonals, NO hippogonals.

	// mode must === 1, only keep it if it can slide in the direction, whether blocked or not
	const thisPieceMoveset = legalmoves.getPieceMoveset(boardsim, type); // Default piece moveset
	if (!thisPieceMoveset.sliding) return true; // This piece can't slide at all
	if (!thisPieceMoveset.sliding[dirKey]) return true; // This piece can't slide ALONG the provided line
	// This piece CAN slide along the provided line...
	return false;
}

/**
 * IF we're in mode 2, this returns an array of all orthogonal and diagonal vectors.
 * We don't return anything if it's mode 3, since EVERYTHING is an exception anyway.
 * If it's mode 1, we don't return anything either, because it depends on whether
 * the piece can into the direction of the vector, and onto our screen.
 */
function getSlideExceptions(): Vec2Key[] {
	const gamefile = gameslot.getGamefile()!;
	let slideExceptions: Vec2Key[] = [];
	// If we're in mode 2, retain all orthogonals and diagonals, EVEN if they can't slide in that direction.
	if (mode === 2) slideExceptions = gamefile.boardsim.pieces.slides.filter((slideDir: Vec2) => math.chebyshevDistance([0,0], slideDir) === 1).map(math.getKeyFromVec2); // Filter out all hippogonal and greater vectors
	return slideExceptions;
}

function removeTypesThatCantSlideOntoScreenFromLineDraft(line: ArrowsLineDraft) {
	// The only pieces in a line that WOULDN'T be able to slide onto the screen
	// is the piece closest to us. ALL other pieces we wouldn't have added otherwise.
	if (line.negDotProd.length > 0) {
		const arrowDraft: ArrowDraft = line.negDotProd[line.negDotProd.length - 1]!;
		if (!arrowDraft.canSlideOntoScreen) line.negDotProd.pop();
	}
	if (line.posDotProd.length > 0) {
		const arrowDraft: ArrowDraft = line.posDotProd[line.posDotProd.length - 1]!;
		if (!arrowDraft.canSlideOntoScreen) line.posDotProd.pop();
	}
}

/**
 * Calculates the more detailed information of the visible arrow indicators this frame,
 * enough so we are able to render them.
 * 
 * It also constructs the list of arrows being hovered over this frame.
 */
function calculateSlideArrows_AndHovered(slideArrowsDraft: SlideArrowsDraft) {
	if (Object.keys(slideArrows).length > 0) throw Error('SHOULD have erased all slide arrows before recalcing');

	const worldWidth = width * boardpos.getBoardScale(); // The world-space width of our images
	const worldHalfWidth = worldWidth / 2;

	const pointerWorlds = mouse.getAllPointerWorlds();

	// Take the arrows draft, construct the actual
	for (const [key, value] of Object.entries(slideArrowsDraft)) {
		const vec2Key = key as Vec2Key;
		const linesOfDirectionDraft = value as { [lineKey: string]: ArrowsLineDraft };

		const slideDir = math.getVec2FromKey(vec2Key as Vec2Key);
		const linesOfDirection: { [lineKey: string]: ArrowsLine } = {};

		const vector = slideDir;
		const negVector = math.negateVector(slideDir);
		
		for (const [lineKey, value] of Object.entries(linesOfDirectionDraft)) {
			const arrowLineDraft = value as ArrowsLineDraft;
			
			const posDotProd: Arrow[] = [];
			const negDotProd: Arrow[] = [];
			
			arrowLineDraft.posDotProd.forEach((arrowDraft, index) => {
				const arrow = processPiece(arrowDraft, vector, arrowLineDraft.intersections[0], index, worldHalfWidth, pointerWorlds, true);
				posDotProd.push(arrow);
			});

			arrowLineDraft.negDotProd.forEach((arrowDraft, index) => {
				const arrow = processPiece(arrowDraft, negVector, arrowLineDraft.intersections[1], index, worldHalfWidth, pointerWorlds, true);
				negDotProd.push(arrow);
			});

			linesOfDirection[lineKey] = { posDotProd, negDotProd };
		}
 
		slideArrows[vec2Key] = linesOfDirection;
	}

	// console.log("Arrows hovered over this frame:");
	// console.log(hoveredArrows);

	// console.log("Arrows instance data calculated this frame:");
	// console.log(slideArrows);
}

/**
 * Calculates the detailed information about a single arrow indicator, enough to be able to render.
 * @param arrowDraft 
 * @param vector - A vector pointing in the direction the arrow points.
 * @param intersection - The intersection with the screen window that the line the piece is on intersects.
 * @param index - If there are adjacent pictures, this may be > 0
 * @param worldHalfWidth
 * @param pointerWorlds - A list of all world coordinates every existing pointer is over.
 * @param appendHover - Whether the arrow, when hovered over, should add itself to the list of arrows hovered over this frame. Should be false for arrows added by other scripts.
 * @returns 
 */
function processPiece(arrowDraft: ArrowDraft, vector: Vec2, intersection: Coords, index: number, worldHalfWidth: number, pointerWorlds: Coords[], appendHover: boolean): Arrow {
	const renderCoords = coordutil.copyCoords(intersection);

	// If this picture is an adjacent picture, adjust it's positioning
	if (index > 0) {
		renderCoords[0] += vector[0] * index * paddingBetwAdjacentPictures;
		renderCoords[1] += vector[1] * index * paddingBetwAdjacentPictures;
	}

	const worldLocation: Coords = space.convertCoordToWorldSpace_IgnoreSquareCenter(renderCoords) as Coords;

	// Does the mouse hover over the piece?
	let hovered = false;
	for (const pointerWorld of pointerWorlds) {
		const chebyshevDist = math.chebyshevDistance(worldLocation, pointerWorld);
		if (chebyshevDist < worldHalfWidth) { // Mouse inside the picture bounding box
			hovered = true;
			// ADD the piece to the list of arrows being hovered over!!!
			if (appendHover) hoveredArrows.push({ piece: arrowDraft.piece, vector });
		}
	}
	// If we clicked, then teleport!
	teleportToPieceIfClicked(arrowDraft.piece, worldLocation, vector, worldHalfWidth);

	return { worldLocation, piece: arrowDraft.piece, hovered };
}

/**
 * This teleports you to the piece it is pointing to IF the mouse has clicked it this frame.
 */
function teleportToPieceIfClicked(piece: Piece, pieceWorld: Coords, vector: Vec2, worldHalfWidth: number) {
	// Left mouse button
	if (mouse.isMouseDown(Mouse.LEFT) || mouse.isMouseClicked(Mouse.LEFT)) processMouseClick(Mouse.LEFT, mouse);
	// Finger simulating right mouse down (annotations mode ON)
	else if ((listener_overlay.isMouseDown(Mouse.RIGHT) || listener_overlay.isMouseClicked(Mouse.RIGHT)) && listener_overlay.isMouseTouch(Mouse.RIGHT)) processMouseClick(Mouse.RIGHT, listener_overlay);

	function processMouseClick(button: MouseButton, listener: typeof mouse | InputListener) {
		const clickWorld = mouse.getMouseWorld(button)!;
		const chebyshevDist = math.chebyshevDistance(pieceWorld, clickWorld);
		if (chebyshevDist < worldHalfWidth) { // Mouse inside the picture bounding box
			if (listener.isMouseClicked(button)) {
				listener.claimMouseClick(button); // Don't let annotations erase/draw

				// Teleport in the direction of the piece's arrow, NOT straight to the piece.

				const startCoords = boardpos.getBoardPos();
				// The direction we will follow when teleporting
				const line1GeneralForm = math.getLineGeneralFormFromCoordsAndVec(startCoords, vector);
				// The line perpendicular to the target piece
				const perpendicularSlideDir: Vec2 = [-vector[1], vector[0]]; // Rotates left 90deg
				const line2GeneralForm = math.getLineGeneralFormFromCoordsAndVec(piece.coords, perpendicularSlideDir);
				// The target teleport coords
				const telCoords = math.calcIntersectionPointOfLines(...line1GeneralForm, ...line2GeneralForm)!; // We know it will be defined because they are PERPENDICULAR

				transition.panTel(startCoords, telCoords);
			} else { // Mouse down
				listener.claimMouseDown(button); // Don't let the board be dragged by this mouse down, or start drawing an arrow by this finger down
			}
		}
	}
}


// Arrow Shifting: Adding / Removing Arrows before rendering ------------------------------------------------------------------------------------------------


type Shift = {
	type: number,
	/**
	 * If true, the piece doesn't move for the duration of its animation.
	 * We are good to add it to the gamefile's lines to calculate the arrows.
	 */
	still: boolean
	/** The coordinates the arrow will be deleted off of */
	start?: Coords,
	/** The coordinates the arrow will be added to */
	end?: Coords,
};

/**
 * A list of arrow modifications made by other scripts
 * after update() and before render(),
 * such as animation.js or droparrows.js
 */
let shifts: Shift[] = [];

/**
 * Deletes any arrow indicators present for the provided piece, and creates
 * new ones, if visible, for its new coordinate location.
 * 
 * This is intended for other scripts to utilize, in between this scripts
 * update() and render() methods!
 * 
 * The coordinates CAN be floating points! Quirky, as the piece is temporarily
 * added to the gamefile with decimal coordinates, but it works!
 * 
 * It has to be added to the game so that the arrow lines are calculated correctly,
 * as it changes how far other pieces can slide along the line its on.
 * @param type - The type of arrow that will be added on {@link end}
 * @param start - The coordinates the arrow will be deleted off of
 * @param end - The coordinates the arrow will be added on
 */
function shiftArrow(type: number, still: boolean, start?: Coords, end?: Coords) {
	if (start === undefined && end === undefined) throw Error('Must provide one of either start or end coords of modified arrow.');
	if (still && end && !coordutil.areCoordsIntegers(end)) throw Error('Cannot add a still-animated arrow to floating point coordinates.');
	if (!areArrowsActiveThisFrame()) return; // Arrow indicators are off, nothing is visible.

	// console.log(`Shifting arrow (still = ${still}):`);
	// console.error(jsutil.deepCopyObject({ type, start, end }));

	if (start) { // Guaranteed a deletion
		/**
		 * For each previous shift, if either their start or end
		 * is on this start (deletion coords), then delete it!
		 * 
		 * check to see if the start is the same as this end coords.
		 * If so, replace that shift with a delete action, and retain the same order.
		 */
		shifts = shifts.filter(shift => {
			return (!shift.start || !coordutil.areCoordsEqual(shift.start, start)) &&
				   (!shift.end   || !coordutil.areCoordsEqual(shift.end,   start));
		});
	}
	// else console.log("Skipping filtering");

	shifts.push({ type, still, start, end } as Shift);

	// console.log("Shifts after adding new shift:");
	// console.log(jsutil.deepCopyObject(shifts));
}

/** Execute any arrow modifications made by animation.js or arrowsdrop.js */
function executeArrowShifts() {
	// console.log("Executing arrow shifts");
	// console.log(jsutil.deepCopyObject(shifts));

	const gamefile = gameslot.getGamefile()!;
	const changes: Change[] = [];

	const worldHalfWidth = (width * boardpos.getBoardScale()) / 2; // The world-space width of our images
	const pointerWorlds = mouse.getAllPointerWorlds();

	shifts.forEach(shift => { // { type: string, index?: number } & ({ start: Coords, end?: Coords } | { start?: Coords, end: Coords });
		if (shift.start) {
			// Delete the piece from the gamefile, so that we can calculate the arrow lines correctly
			const originalPiece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, shift.start);
			if (originalPiece === undefined) throw Error('Arrow shift delete piece does not exist! start: ' + shift.start + ' Perhaps we are animating a move we are not viewing?');
			boardchanges.queueDeletePiece(changes, true, originalPiece);
		}
		if (shift.end) {
			if (shift.still) {
				// Add the piece to the gamefile, so that we can calculate the arrow lines correctly
				const piece = { type: shift.type, coords: shift.end, index: -1 };
				boardchanges.queueAddPiece(changes, piece);
			} else {
				// This is an arrow animation for a piece IN MOTION, not a still animation.
				// Add an animated arrow for it, since it is gonna be at a floating point coordinate
				if (math.boxContainsSquare(boundingBoxInt!, shift.end)) return; // On-screen, no arrows needed for the piece, no matter their vector

				const piece = { type: shift.type, coords: shift.end, index: -1 };
				const arrowDraft: ArrowDraft = { piece, canSlideOntoScreen: true };

				// Add an arrow for every applicable direction
				for (const lineKey of gamefile.boardsim.pieces.lines.keys()) {
					let line = math.getVec2FromKey(lineKey);
					
					if (isAnimatedArrowUnnecessary(gamefile.boardsim, shift.type, line, lineKey)) continue; // Arrow mode isn't high enough, and the piece can't slide in the vector direction

					// Determine the line's dot product with the screen box.
					// Flip the vector if need be, to point it in the right direction.
					const thisPieceIntersections = math.findLineBoxIntersections(arrowDraft.piece.coords, line, boundingBoxFloat!); // should THIS BE FLOAT???
					if (thisPieceIntersections.length < 2) continue; // RARE BUG. I think this is a failure of findLineBoxIntersections(). Just skip the piece when this happens.
					const positiveDotProduct = thisPieceIntersections[0]!.positiveDotProduct; // We know the dot product of both intersections will be identical, because the piece is off-screen.	
					if (positiveDotProduct) line = math.negateVector(line);
					// At what point does it intersect the screen?
					const intersect = positiveDotProduct ? thisPieceIntersections[0]!.coords : thisPieceIntersections[1]!.coords;

					const arrow: Arrow = processPiece(arrowDraft, line, intersect, 0, worldHalfWidth, pointerWorlds, false);
					const animatedArrow: AnimatedArrow = {
						...arrow,
						direction: line,
					};
					animatedArrows.push(animatedArrow);
				}
			}
		}
	});

	// console.log("Applying changes:");
	// console.log(changes);

	// Apply the board changes
	boardchanges.runChanges(gamefile, changes, boardchanges.changeFuncs, true);

	shifts.forEach(shift => {
		// Recalculate every single line on the start.
		if (shift.start) recalculateLinesThroughCoords(gamefile.boardsim, shift.start);
		// Only recalculate through the end coordinate if the animation doesn't move for its duration
		if (shift.end && shift.still) recalculateLinesThroughCoords(gamefile.boardsim, shift.end);
	});

	// console.log("Animated arrows:");
	// console.log(animatedArrows);

	// Restore the board state
	boardchanges.runChanges(gamefile, changes, boardchanges.changeFuncs, false);
}

/**
 * Recalculates all of the arrow lines the given piece
 * is on, adding them to this frame's list of arrows.
 */
function recalculateLinesThroughCoords(boardsim: Board, coords: Coords) {
	// console.log("Recalculating lines through coords: ", coords);
	// Recalculate every single line it is on.

	// Prevents legal move highlights from rendering for
	// the currently animated arrow indicator when hovering over its destination
	// hoveredArrows = hoveredArrows.filter(hoveredArrow => !coordutil.areCoordsEqual(hoveredArrow.piece.coords, coords));

	for (const [slideKey, linegroup] of boardsim.pieces.lines) { // For each slide direction in the game...
		const slide = coordutil.getCoordsFromKey(slideKey);

		const lineKey = organizedpieces.getKeyFromLine(slide, coords);

		// Delete the original arrow line if it exists
		if (slideKey in slideArrows) {
			delete slideArrows[slideKey]![lineKey];
			if (Object.keys(slideArrows[slideKey]!).length === 0) delete slideArrows[slideKey];
		}
		
		// Recalculate the arrow line...

		// Fetch the organized line that our piece is on this direction.
		const organizedLine = linegroup.get(lineKey);
		if (organizedLine === undefined) continue; // No pieces on line, empty

		const arrowsLineDraft = calcArrowsLineDraft(boardsim, boundingBoxInt!, boundingBoxFloat!, slide, slideKey, organizedLine);
		if (arrowsLineDraft === undefined) continue; // Only intersects the corner of our screen, not visible.

		// Remove Unnecessary arrows...

		const slideExceptions = getSlideExceptions();
		if (!slideExceptions.includes(slideKey)) {
			removeTypesThatCantSlideOntoScreenFromLineDraft(arrowsLineDraft);
			if (arrowsLineDraft.negDotProd.length === 0 && arrowsLineDraft.posDotProd.length === 0) continue; // No more pieces on this line
		}

		// Calculate more detailed information, enough to render...

		const worldWidth = width * boardpos.getBoardScale(); // The world-space width of our images
		const worldHalfWidth = worldWidth / 2;

		const pointerWorlds = mouse.getAllPointerWorlds();

		const vector = slide;
		const negVector = math.negateVector(slide);

		const posDotProd: Arrow[] = [];
		const negDotProd: Arrow[] = [];
		
		arrowsLineDraft.posDotProd.forEach((arrowDraft, index) => {
			const arrow = processPiece(arrowDraft, vector, arrowsLineDraft.intersections[0], index, worldHalfWidth, pointerWorlds, false);
			posDotProd.push(arrow);
		});

		arrowsLineDraft.negDotProd.forEach((arrowDraft, index) => {
			const arrow = processPiece(arrowDraft, negVector, arrowsLineDraft.intersections[1], index, worldHalfWidth, pointerWorlds, false);
			negDotProd.push(arrow);
		});

		slideArrows[slideKey] = slideArrows[slideKey] ?? {}; // Make sure this exists first.
		slideArrows[slideKey][lineKey] = { posDotProd, negDotProd }; // Set the new arrow line
	};
}


// Rendering ------------------------------------------------------------------------------------------------------------------------


/**
 * Renders all the arrow indicators for this frame.
 * 
 * Also calls for the cached legal moves of the hovered
 * arrows to be updated.
 */
function render() {
	regenerateModelAndRender();
}

function regenerateModelAndRender() {
	if (Object.keys(slideArrows).length === 0 && animatedArrows.length === 0) return; // No visible arrows, don't generate the model

	const worldWidth = width * boardpos.getBoardScale(); // The world-space width of our images
	const halfWorldWidth = worldWidth / 2;

	// Position data of the single instance
	const left = -halfWorldWidth;
	const right = halfWorldWidth;
	const bottom = -halfWorldWidth;
	const top = halfWorldWidth;
	// Texture data of the single instance
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texright, texbottom, textop } = bufferdata.getTexDataGeneric(rotation);

	// Initialize the data arrays...

	const vertexData_Pictures: number[] = bufferdata.getDataQuad_Texture(left, bottom, right, top, texleft, texbottom, texright, textop);
	const instanceData_Pictures: number[] = [];

	const vertexData_Arrows: number[] = getVertexDataOfArrow(halfWorldWidth);
	const instanceData_Arrows: number[] = [];

	// ADD THE DATA...

	for (const [key, value] of Object.entries(slideArrows)) {
		const vec2Key = key as Vec2Key;
		const slideLinesOfDirection = value as { [lineKey: string]: ArrowsLine };

		const slideDir = math.getVec2FromKey(vec2Key as Vec2Key);

		// These are swamped so the arrow always points and the opposite direction the piece is able to slide.
		const vector = math.negateVector(slideDir);
		const negVector = slideDir;

		for (const value of Object.values(slideLinesOfDirection)) {
			const slideLine = value as ArrowsLine;

			slideLine.posDotProd.forEach((arrow, index) => concatData(instanceData_Pictures, instanceData_Arrows, arrow, vector, index));
			slideLine.negDotProd.forEach((arrow, index) => concatData(instanceData_Pictures, instanceData_Arrows, arrow, negVector, index));
		}
	}

	// Add the animated arrows that are in motion
	for (const pieceArrow of animatedArrows) {
		concatData(instanceData_Pictures, instanceData_Arrows, pieceArrow, pieceArrow.direction, 0);
	}

	/*
	 * The buffer model of the piece mini images on
	 * the edge of the screen. **Doesn't include** the little arrows.
	 */
	const attribInfoInstancedPictures: AttributeInfoInstanced = {
		vertexDataAttribInfo: [{ name: 'position', numComponents: 2 }, { name: 'texcoord', numComponents: 2 }],
		instanceDataAttribInfo: [{ name: 'instanceposition', numComponents: 2 }, { name: 'instancetexcoord', numComponents: 2 }, { name: 'instancecolor', numComponents: 4 }]
	};
	const modelPictures = createModel_Instanced_GivenAttribInfo(vertexData_Pictures, instanceData_Pictures, attribInfoInstancedPictures, "TRIANGLES", spritesheet.getSpritesheet());

	/*
	 * The buffer model of the little arrows on
	 * the edge of the screen next to the mini piece images.
	 */
	const attribInfoInstancedArrows: AttributeInfoInstanced = {
		vertexDataAttribInfo: [{ name: 'position', numComponents: 2 }],
		instanceDataAttribInfo: [{ name: 'instanceposition', numComponents: 2 }, { name: 'instancecolor', numComponents: 4 }, { name: 'instancerotation', numComponents: 1 }]
	};
	const modelArrows = createModel_Instanced_GivenAttribInfo(vertexData_Arrows, instanceData_Arrows, attribInfoInstancedArrows, "TRIANGLES");

	modelPictures.render();
	modelArrows.render();
}


/**
 * Takes an arrow, generates the vertex data of both the PICTURE and ARROW,
 * and appends them to their respective vertex data arrays.
 */
function concatData(instanceData_Pictures: number[], instanceData_Arrows: number[], arrow: Arrow, vector: Vec2, index: number) {

	/**
	 * Our pictures' instance data needs to contain:
	 * 
	 * position offset (2 numbers)
	 * unique texcoord (2 numbers)
	 * unique color (4 numbers)
	 */

	const thisTexLocation = spritesheet.getSpritesheetDataTexLocation(arrow.piece.type);

	// Color
	const a = arrow.hovered ? 1 : opacity; // Are we hovering over? If so, opacity needs to be 100%

	// Opacity changing with distance
	// let maxAxisDist = math.chebyshevDistance(boardpos.getBoardPos(), pieceCoords) - 8;
	// opacity = Math.sin(maxAxisDist / 40) * 0.5

	//							   instaceposition	   instancetexcoord  instancecolor
	instanceData_Pictures.push(...arrow.worldLocation, ...thisTexLocation, 1,1,1,a);

	// Next append the data of the little arrow!

	if (index > 0) return; // We can skip, since it is an adjacent picture!

	/**
	 * Our arrow's instance data needs to contain:
	 * 
	 * position offset (2 numbers)
	 * unique color (4 numbers)
	 * rotation offset (1 number)
	 */

	const angle = Math.atan2(vector[1], vector[0]);
	//								position		  color	 rotation
	instanceData_Arrows.push(...arrow.worldLocation, 0,0,0,a, angle);
}

/**
 * Returns the vertex data of a single arrow instance,
 * for this frame, only containing positional information.
 * @param halfWorldWidth - Half of the width of the arrow indicators for the current frame (dependant on scale).
 */
function getVertexDataOfArrow(halfWorldWidth: number): number[] {
	const size = halfWorldWidth * 0.3; // Default size of the little arrows
	return [
		halfWorldWidth, -size,
		halfWorldWidth, size,
		halfWorldWidth + size, 0
	];
}


// ----------------------------------------------------------------------------------------------------------------


export default {
	pieceCountToDisableArrows,
	lineCountToDisableArrows,

	getMode,
	setMode,
	toggleArrows,
	getHoveredArrows,
	areHoveringAtleastOneArrow,
	shiftArrow,
	executeArrowShifts,
	update,
	render,
};

export type {
	HoveredArrow
};