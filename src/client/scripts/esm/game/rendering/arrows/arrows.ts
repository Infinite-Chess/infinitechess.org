// src/client/scripts/esm/game/rendering/arrows/arrows.ts

/**
 * This script calculates and renders the arrow indicators
 * on the sides of the screen, pointing to pieces off-screen
 * that are in that direction.
 *
 * If the pictures are clicked, we initiate a teleport to that piece.
 *
 * Other scripts may add/remove arrows in between update() and render() calls.
 */

import type { Piece } from '../../../../../../shared/chess/util/boardutil.js';
import type { Change } from '../../../../../../shared/chess/logic/boardchanges.js';
import type { Board, FullGame } from '../../../../../../shared/chess/logic/gamefile.js';
import type { AttributeInfoInstanced } from '../../../webgl/Renderable.js';
import type {
	BDCoords,
	Coords,
	DoubleCoords,
} from '../../../../../../shared/chess/util/coordutil.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import jsutil from '../../../../../../shared/util/jsutil.js';
import bimath from '../../../../../../shared/util/math/bimath.js';
import typeutil from '../../../../../../shared/chess/util/typeutil.js';
import geometry from '../../../../../../shared/util/math/geometry.js';
import bdcoords from '../../../../../../shared/chess/util/bdcoords.js';
import coordutil from '../../../../../../shared/chess/util/coordutil.js';
import boardutil from '../../../../../../shared/chess/util/boardutil.js';
import legalmoves from '../../../../../../shared/chess/logic/legalmoves.js';
import boardchanges from '../../../../../../shared/chess/logic/boardchanges.js';
import { rawTypes } from '../../../../../../shared/chess/util/typeutil.js';
import vectors, { Vec2, Vec2Key } from '../../../../../../shared/util/math/vectors.js';
import organizedpieces, { LineKey } from '../../../../../../shared/chess/logic/organizedpieces.js';
import bounds, { BoundingBox, BoundingBoxBD } from '../../../../../../shared/util/math/bounds.js';

import space from '../../misc/space.js';
import mouse from '../../../util/mouse.js';
import gameslot from '../../chess/gameslot.js';
import boardpos from '../boardpos.js';
import boardtiles from '../boardtiles.js';
import primitives from '../primitives.js';
import Transition from '../transitions/Transition.js';
import spritesheet from '../spritesheet.js';
import guigameinfo from '../../gui/guigameinfo.js';
import perspective from '../perspective.js';
import frametracker from '../frametracker.js';
import guinavigation from '../../gui/guinavigation.js';
import { listener_overlay } from '../../chess/game.js';
import arrowlegalmovehighlights from './arrowlegalmovehighlights.js';
import { InputListener, Mouse, MouseButton } from '../../input.js';
import { createRenderable_Instanced_GivenInfo } from '../../../webgl/Renderable.js';

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
		[lineKey: string]: ArrowsLineDraft;
	};
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
	posDotProd: ArrowDraft[];
	/** Pieces on this line that intersect the screen with a negative dot product.
	 * SORTED in order of closest to the screen to farthest.
	 * The arrow direction for these will be flipped to the other side. */
	negDotProd: ArrowDraft[];
	/** An array of the points this line intersects the screen bounding box,
	 * in order of ascending dot product. */
	intersections: [BDCoords, BDCoords];
}

/** A single arrow indicator DRAFT. This may be removed depending on our mode. */
type ArrowDraft = { piece: ArrowPiece; canSlideOntoScreen: boolean };

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
		[lineKey: string]: ArrowsLine;
	};
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
	posDotProd: Arrow[];
	/** Pieces on this line that intersect the screen with a negative dot product.
	 * SORTED in order of closest to the screen to farthest.
	 * The arrow direction for these will be flipped to the other side. */
	negDotProd: Arrow[];
}

/** A single arrow indicator, with enough information to be able to render it. */
interface Arrow {
	worldLocation: DoubleCoords;
	piece: ArrowPiece;
	/** Whether the arrow is being hovered over by the mouse */
	hovered: boolean;
}

/**
 * Reflection of the {@link Piece} type, but with extra decimal precision
 * for the coordinates (needed for animated arrows).
 */
interface ArrowPiece {
	type: number;
	coords: BDCoords;
	index: number;
	/** Whether the piece is at a floating point coordinate. */
	floating: boolean;
}

/** Animated arrows are treated separately, we also need to know their direction. */
interface AnimatedArrow extends Arrow {
	direction: Vec2;
}

/** An arrow that is being hovered over this frame */
interface HoveredArrow {
	/** A reference to the piece it is pointing to */
	piece: ArrowPiece;
	/**
	 * The slide direction / slope / step for this arrow.
	 * Is the same as the direction the arrow is pointing.
	 * Negated is auto-negated when applicable.
	 */
	vector: Vec2;
}

// Variables ----------------------------------------------------------------------------

/** The maximum number of pieces in a game before we disable arrow indicator rendering, for performance. */
const pieceCountToDisableArrows = 40_000;
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
const renderZoomLimitVirtualPixels: BigDecimal = bd.fromBigInt(12n); // virtual pixels. Default: 20

/** The distance in perspective mode to render the arrow indicators from the camera.
 * We need this because there is no normal edge of the screen like in 2D mode. */
const perspectiveDist = 17;

const ONE = bd.fromBigInt(1n);
const HALF = bd.fromNumber(0.5);

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
let boundingBoxFloat: BoundingBoxBD | undefined;
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
function reset(): void {
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
function setMode(value: typeof mode): void {
	mode = value;
	if (mode === 0) {
		reset();
		arrowlegalmovehighlights.reset(); // Erase, otherwise their legal move highlights continue to render
	}
}

/** Rotates the current mode of the arrow indicators. */
function toggleArrows(): void {
	frametracker.onVisualChange();
	// Have to do it weirdly like this, instead of using '++', because typescript complains that nextMode is of type number.
	let nextMode: typeof mode =
		mode === 0 ? 1 : mode === 1 ? 2 : mode === 2 ? 3 : /* mode === 3 ? */ 0;
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
function update(): void {
	reset(); // Initiate the arrows empty
	if (!areArrowsActiveThisFrame()) {
		// Arrow indicators are off, nothing is visible.
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
	const slideArrowsDraft: SlideArrowsDraft = generateArrowsDraft(
		boundingBoxInt!,
		boundingBoxFloat!,
	);

	// Remove arrows based on our mode
	removeUnnecessaryArrows(slideArrowsDraft);
	// console.log("Arrows after removing unnecessary:");
	// console.log(slideArrows);

	// Calc the more detailed information required about each arrow,
	// since we've now removed all the ones not visible.

	calculateSlideArrows_AndHovered(slideArrowsDraft);
}

/** Whether the arrows should be calculated and rendered this frame */
function areArrowsActiveThisFrame(): boolean {
	// false if the arrows are off, or if the board is too zoomed out
	return (
		mode !== 0 &&
		bd.compare(boardtiles.gtileWidth_Pixels(false), renderZoomLimitVirtualPixels) >= 0
	);
}

/**
 * Calculates the visible bounding box of the screen for this frame,
 * both the integer-rounded, and the exact floating point one.
 *
 * These boxes are used to test whether a piece is visible on-screen or not.
 * As if it's not, it should get an arrow.
 */
function updateBoundingBoxesOfVisibleScreen(): void {
	boundingBoxFloat = perspective.getEnabled()
		? boardtiles.generatePerspectiveBoundingBox(perspectiveDist)
		: boardtiles.gboundingBoxFloat();

	// Apply the padding of the navigation and gameinfo bars to the screen bounding box.
	if (!perspective.getEnabled()) {
		// Perspective is OFF
		let headerPad = space.convertPixelsToWorldSpace_Virtual(guinavigation.getHeightOfNavBar());
		let footerPad = space.convertPixelsToWorldSpace_Virtual(
			guigameinfo.getHeightOfGameInfoBar(),
		);
		// Reverse header and footer pads if we're viewing black's side
		if (!gameslot.isLoadedGameViewingWhitePerspective())
			[headerPad, footerPad] = [footerPad, headerPad]; // Swap values
		// Apply the paddings to the bounding box
		boundingBoxFloat.top = bd.subtract(
			boundingBoxFloat.top,
			space.convertWorldSpaceToGrid(headerPad),
		);
		boundingBoxFloat.bottom = bd.add(
			boundingBoxFloat.bottom,
			space.convertWorldSpaceToGrid(footerPad),
		);
	}

	// If any part of the square is on screen, this box rounds outward to contain it.
	boundingBoxInt = boardtiles.roundAwayBoundingBox(boundingBoxFloat);

	/**
	 * Adds a little bit of padding to the bounding box, so that the arrows of the
	 * arrows indicators aren't touching the edge of the screen.
	 */
	const padding: BigDecimal = getPadding();
	boundingBoxFloat.left = bd.add(boundingBoxFloat.left, padding);
	boundingBoxFloat.right = bd.subtract(boundingBoxFloat.right, padding);
	boundingBoxFloat.bottom = bd.add(boundingBoxFloat.bottom, padding);
	boundingBoxFloat.top = bd.subtract(boundingBoxFloat.top, padding);
}

/** Returns the distance one arrow's picture's center should be from the screen edge. */
function getPadding(): BigDecimal {
	return bd.fromNumber(width / 2 + sidePadding);
}

/**
 * Generates a draft of all the arrows for a game, as if All (plus hippogonals) mode was on.
 * This contains minimal information, as some may be removed later.
 */
function generateArrowsDraft(
	boundingBoxInt: BoundingBox,
	boundingBoxFloat: BoundingBoxBD,
): SlideArrowsDraft {
	/** The running list of arrows that should be visible */
	const slideArrowsDraft: SlideArrowsDraft = {};
	const gamefile = gameslot.getGamefile()!;
	gamefile.boardsim.pieces.slides.forEach((slide: Vec2) => {
		// For each slide direction in the game...
		const slideKey: Vec2Key = vectors.getKeyFromVec2(slide);

		// Find the 2 points on opposite sides of the bounding box
		// that will contain all organized lines of the given vector
		// intersecting the box between them.

		const containingPoints = geometry.findCrossSectionalWidthPoints(slide, boundingBoxInt);
		const containingPointsLineC = containingPoints.map((point) =>
			vectors.getLineCFromCoordsAndVec(point, slide),
		) as [bigint, bigint];
		// Any line of this slope of which its C value is not within these 2 are outside of our screen,
		// so no arrows will be visible for the piece.
		containingPointsLineC.sort((a, b) => bimath.compare(a, b)); // Sort them so C is ascending. Then index 0 will be the minimum and 1 will be the max.

		// For all our lines in the game with this slope...
		const organizedLinesOfDir = gamefile.boardsim.pieces.lines.get(slideKey)!;
		for (const [lineKey, organizedLine] of organizedLinesOfDir) {
			// The C of the lineKey (`C|X`) with this slide at the very left & right sides of the screen.
			const C: bigint = organizedpieces.getCFromKey(lineKey);
			if (
				bimath.compare(C, containingPointsLineC[0]) < 0 ||
				bimath.compare(C, containingPointsLineC[1]) > 0
			)
				continue; // Next line, this one is off-screen, so no piece arrows are visible

			// Calculate the ACTUAL arrows that should be visible for this specific organized line.
			const arrowsLine = calcArrowsLineDraft(
				gamefile,
				boundingBoxInt,
				boundingBoxFloat,
				slide,
				slideKey,
				organizedLine,
			);
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
function calcArrowsLineDraft(
	gamefile: FullGame,
	boundingBoxInt: BoundingBox,
	boundingBoxFloat: BoundingBoxBD,
	slideDir: Vec2,
	slideKey: Vec2Key,
	organizedline: number[],
): ArrowsLineDraft | undefined {
	const negDotProd: ArrowDraft[] = [];
	const posDotProd: ArrowDraft[] = [];

	/** The piece on the side that is closest to our screen. */
	let closestPosDotProd: ArrowDraft | undefined;
	/** The piece on the side that is closest to our screen. */
	let closestNegDotProd: ArrowDraft | undefined;

	const axis = slideDir[0] === 0n ? 1 : 0;

	const firstPiece = boardutil.getPieceFromIdx(gamefile.boardsim.pieces, organizedline[0]!)!;

	/**
	 * The 2 intersections points of the whole organized line, consistent for every piece on it.
	 * The only difference is each piece may have a different dot product,
	 * which just means it's on the opposite side.
	 */
	const intersections = geometry
		.findLineBoxIntersectionsBD(
			bdcoords.FromCoords(firstPiece.coords),
			slideDir,
			boundingBoxFloat,
		)
		.map((c) => c.coords);
	if (intersections.length < 2) return; // Arrow line intersected screen box exactly on the corner!! Let's skip constructing this line. No arrow will be visible

	organizedline.forEach((idx) => {
		const piece = boardutil.getPieceFromIdx(gamefile.boardsim.pieces, idx)!;
		const arrowPiece: ArrowPiece = {
			type: piece.type,
			coords: bdcoords.FromCoords(piece.coords),
			index: piece.index,
			floating: false,
		};

		// Is the piece off-screen?
		const boundingBoxIntBD = bounds.castBoundingBoxToBigDecimal(boundingBoxInt);
		if (bounds.boxContainsSquareBD(boundingBoxIntBD, arrowPiece.coords)) return; // On-screen, no arrow needed

		// Piece is guaranteed off-screen...

		// console.log(boundingBoxFloat, boundingBoxInt)
		const thisPieceIntersections = geometry.findLineBoxIntersectionsBD(
			arrowPiece.coords,
			slideDir,
			boundingBoxFloat,
		);
		if (thisPieceIntersections.length < 2) return;
		const positiveDotProduct = thisPieceIntersections[0]!.positiveDotProduct; // We know the dot product of both intersections will be identical, because the piece is off-screen.

		const arrowDraft: ArrowDraft = { piece: arrowPiece, canSlideOntoScreen: false };

		// Update the piece that is closest to the screen box.
		if (positiveDotProduct) {
			if (closestPosDotProd === undefined) closestPosDotProd = arrowDraft;
			else if (bd.compare(arrowPiece.coords[axis], closestPosDotProd.piece.coords[axis]) > 0)
				closestPosDotProd = arrowDraft;
		} else {
			// negativeDotProduct
			if (closestNegDotProd === undefined) closestNegDotProd = arrowDraft;
			else if (bd.compare(arrowPiece.coords[axis], closestNegDotProd.piece.coords[axis]) < 0)
				closestNegDotProd = arrowDraft;
		}

		/**
		 * Calculate it's maximum slide.
		 *
		 * If it is able to slide (ignoring ignore function, and ignoring check respection)
		 * into our screen area, then it should be guaranteed an arrow,
		 * EVEN if it's not the closest piece to us on the line
		 * (which would mean it phased/skipped over pieces due to a custom blocking function)
		 */

		const slideLegalLimit = legalmoves.calcPiecesLegalSlideLimitOnSpecificLine(
			gamefile.boardsim,
			gamefile.basegame.gameRules.worldBorder,
			piece,
			slideDir,
			slideKey,
			organizedline,
		);
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
		const firstIntersection = positiveDotProduct
			? thisPieceIntersections[0]!
			: thisPieceIntersections[1]!;

		// What is the distance to the first intersection point?
		let firstIntersectionDist = vectors.chebyshevDistanceBD(
			arrowPiece.coords,
			firstIntersection.coords,
		);
		// Subtract the padding from the intersection so we get the distance to the intersection of the SCREEN EDGE.
		firstIntersectionDist = bd.subtract(firstIntersectionDist, getPadding());

		// What is the distance to the farthest point this piece can slide along this direction?
		let farthestSlidePoint: Coords | null;
		if (positiveDotProduct) {
			farthestSlidePoint =
				slideLegalLimit[1] === null
					? null
					: [
							// Multiply by the number of steps the piece can do in that direction
							piece.coords[0] + slideDir[0] * slideLegalLimit[1],
							piece.coords[1] + slideDir[1] * slideLegalLimit[1],
						];
		} else {
			// Negative dot product
			farthestSlidePoint =
				slideLegalLimit[0] === null
					? null
					: [
							piece.coords[0] - slideDir[0] * slideLegalLimit[0],
							piece.coords[1] - slideDir[1] * slideLegalLimit[0],
						];
		}
		const farthestSlidePointDist: bigint | null =
			farthestSlidePoint === null
				? null
				: vectors.chebyshevDistance(piece.coords, farthestSlidePoint);

		// If the farthest slide point distance is greater than the first intersection
		// distance, then the piece is able to slide into the screen bounding box!

		if (farthestSlidePointDist !== null) {
			let farthestSlidePointDistBD = bd.fromBigInt(farthestSlidePointDist);
			// Add the additional distance from the center of the square to its edge
			// This is so that if any part of the furthest square highlight to
			// move to is visible on screen, we will still render the arrow!
			farthestSlidePointDistBD = bd.add(farthestSlidePointDistBD, HALF);

			// If the farthest slide point distance is less than the first intersection distance,
			// then this piece cannot slide onto the screen, so we skip it.
			if (bd.compare(farthestSlidePointDistBD, firstIntersectionDist) < 0) return; // This piece cannot slide so far as to intersect the screen bounding box
		}

		// This piece CAN slide far enough to enter our screen...
		arrowDraft.canSlideOntoScreen = true;

		// Add the piece to the arrow line
		if (positiveDotProduct) posDotProd.push(arrowDraft);
		else /* Opposite side */ negDotProd.push(arrowDraft);
	});

	/**
	 * Add the closest left/right pieces if they haven't been added already
	 * (which would only be the case if they can slide onto our screen),
	 * And DON'T add them if they are a VOID square!
	 */
	if (
		closestPosDotProd !== undefined &&
		!posDotProd.includes(closestPosDotProd) &&
		typeutil.getRawType(closestPosDotProd.piece.type) !== rawTypes.VOID
	)
		posDotProd.push(closestPosDotProd);
	if (
		closestNegDotProd !== undefined &&
		!negDotProd.includes(closestNegDotProd) &&
		typeutil.getRawType(closestNegDotProd.piece.type) !== rawTypes.VOID
	)
		negDotProd.push(closestNegDotProd);

	if (posDotProd.length === 0 && negDotProd.length === 0) return; // If both are empty, return undefined

	// Now sort them.
	posDotProd.sort((entry1, entry2) =>
		bd.compare(entry1.piece.coords[axis], entry2.piece.coords[axis]),
	);
	negDotProd.sort((entry1, entry2) =>
		bd.compare(entry2.piece.coords[axis], entry1.piece.coords[axis]),
	);
	// console.log(`Sorted left & right arrays of line of arrows for slideDir ${JSON.stringify(slideDir)}, lineKey ${lineKey}:`);
	// console.log(left);
	// console.log(right);

	return { negDotProd, posDotProd, intersections: intersections as [BDCoords, BDCoords] };
}

/**
 * Removes arrows based on the mode.
 *
 * mode == 1: Removes arrows to ONLY include the pieces which can legally slide into our screen (which may include hippogonals)
 * mode == 2: Everything in mode 1, PLUS all orthogonals and diagonals, whether or not the piece can slide into our sreen
 * mode == 3: Everything in mode 1 & 2, PLUS all hippogonals, whether or not the piece can slide into our screen
 */
function removeUnnecessaryArrows(slideArrowsDraft: SlideArrowsDraft): void {
	if (mode === 3) return; // Don't remove anything

	const slideExceptions = getSlideExceptions();

	for (const direction in slideArrowsDraft) {
		if (slideExceptions.includes(direction as Vec2Key)) continue; // Keep it anyway, our arrows mode is high enough
		// Remove types that can't slide onto the screen...
		const arrowsByDir = slideArrowsDraft[direction as Vec2Key];
		for (const key in arrowsByDir) {
			// LineKey
			const line: ArrowsLineDraft = arrowsByDir[key]!;
			removeTypesThatCantSlideOntoScreenFromLineDraft(line);
			if (line.negDotProd.length === 0 && line.posDotProd.length === 0)
				delete arrowsByDir[key as LineKey];
		}
		if (jsutil.isEmpty(slideArrowsDraft[direction as Vec2Key]!))
			delete slideArrowsDraft[direction as Vec2Key];
	}
}

/** Checks if a single animated arrow is needed, based on our current mode, and its direction. */
function isAnimatedArrowUnnecessary(
	boardsim: Board,
	type: number,
	direction: Vec2,
	dirKey: Vec2Key,
): boolean {
	if (mode === 3) return false; // Keep it, whether hippogonal orthogonal or diagonal
	if (mode === 2) return vectors.chebyshevDistance([0n, 0n], direction) !== 1n; // Only keep orthogonals and diagonals, NO hippogonals.

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
	if (mode === 2)
		slideExceptions = gamefile.boardsim.pieces.slides
			.filter((slideDir: Vec2) => vectors.chebyshevDistance([0n, 0n], slideDir) === 1n)
			.map(vectors.getKeyFromVec2); // Filter out all hippogonal and greater vectors
	return slideExceptions;
}

function removeTypesThatCantSlideOntoScreenFromLineDraft(line: ArrowsLineDraft): void {
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
function calculateSlideArrows_AndHovered(slideArrowsDraft: SlideArrowsDraft): void {
	if (Object.keys(slideArrows).length > 0)
		throw Error('SHOULD have erased all slide arrows before recalcing');

	const worldHalfWidth = (width * boardpos.getBoardScaleAsNumber()) / 2;

	const pointerWorlds = mouse.getAllPointerWorlds();

	// Take the arrows draft, construct the actual
	for (const [key, value] of Object.entries(slideArrowsDraft)) {
		const vec2Key = key as Vec2Key;
		const linesOfDirectionDraft = value as { [lineKey: string]: ArrowsLineDraft };

		const slideDir = vectors.getVec2FromKey(vec2Key as Vec2Key);
		const linesOfDirection: { [lineKey: string]: ArrowsLine } = {};

		const vector = slideDir;
		const negVector = vectors.negateVector(slideDir);

		for (const [lineKey, value] of Object.entries(linesOfDirectionDraft)) {
			const arrowLineDraft = value as ArrowsLineDraft;

			const posDotProd: Arrow[] = [];
			const negDotProd: Arrow[] = [];

			arrowLineDraft.posDotProd.forEach((arrowDraft, index) => {
				const arrow = processPiece(
					arrowDraft.piece,
					vector,
					arrowLineDraft.intersections[0],
					index,
					worldHalfWidth,
					pointerWorlds,
					true,
				);
				posDotProd.push(arrow);
			});

			arrowLineDraft.negDotProd.forEach((arrowDraft, index) => {
				const arrow = processPiece(
					arrowDraft.piece,
					negVector,
					arrowLineDraft.intersections[1],
					index,
					worldHalfWidth,
					pointerWorlds,
					true,
				);
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
 * @param piece
 * @param vector - A vector pointing in the direction the arrow points.
 * @param intersection - The intersection with the screen window that the line the piece is on intersects.
 * @param index - If there are adjacent pictures, this may be > 0
 * @param worldHalfWidth
 * @param pointerWorlds - A list of all world coordinates every existing pointer is over.
 * @param appendHover - Whether the arrow, when hovered over, should add itself to the list of arrows hovered over this frame. Should be false for arrows added by other scripts.
 * @returns
 */
function processPiece(
	piece: ArrowPiece,
	vector: Vec2,
	intersection: BDCoords,
	index: number,
	worldHalfWidth: number,
	pointerWorlds: DoubleCoords[],
	appendHover: boolean,
): Arrow {
	const renderCoords = intersection; // Don't think we need to deep copy?

	const worldLocation: DoubleCoords =
		space.convertCoordToWorldSpace_IgnoreSquareCenter(renderCoords);

	// If this picture is an adjacent picture, adjust it's positioning
	if (index > 0) {
		const scale = boardpos.getBoardScaleAsNumber();
		worldLocation[0] += Number(vector[0]) * index * paddingBetwAdjacentPictures * scale;
		worldLocation[1] += Number(vector[1]) * index * paddingBetwAdjacentPictures * scale;
	}

	// Does the mouse hover over the piece?
	let hovered = false;
	for (const pointerWorld of pointerWorlds) {
		const chebyshevDist = vectors.chebyshevDistanceDoubles(worldLocation, pointerWorld);
		if (chebyshevDist < worldHalfWidth) {
			// Mouse inside the picture bounding box
			hovered = true;
			// ADD the piece to the list of arrows being hovered over!!!
			if (appendHover) hoveredArrows.push({ piece, vector });
		}
	}
	// If we clicked, then teleport!
	teleportToPieceIfClicked(piece, worldLocation, vector, worldHalfWidth);

	return { worldLocation, piece, hovered };
}

/**
 * This teleports you to the piece it is pointing to IF the mouse has clicked it this frame.
 */
function teleportToPieceIfClicked(
	piece: ArrowPiece,
	pieceWorld: DoubleCoords,
	vector: Vec2,
	worldHalfWidth: number,
): void {
	// Left mouse button
	if (mouse.isMouseDown(Mouse.LEFT) || mouse.isMouseClicked(Mouse.LEFT))
		processMouseClick(Mouse.LEFT, mouse);
	// Finger simulating right mouse down (annotations mode ON)
	else if (
		(listener_overlay.isMouseDown(Mouse.RIGHT) ||
			listener_overlay.isMouseClicked(Mouse.RIGHT)) &&
		listener_overlay.isMouseTouch(Mouse.RIGHT)
	)
		processMouseClick(Mouse.RIGHT, listener_overlay);

	function processMouseClick(button: MouseButton, listener: typeof mouse | InputListener): void {
		const clickWorld = mouse.getMouseWorld(button);
		if (!clickWorld) return; // Maybe we're looking into sky?
		const chebyshevDist = vectors.chebyshevDistanceDoubles(pieceWorld, clickWorld);
		if (chebyshevDist < worldHalfWidth) {
			// Mouse inside the picture bounding box
			if (listener.isMouseClicked(button)) {
				listener.claimMouseClick(button); // Don't let annotations erase/draw

				// Teleport in the direction of the piece's arrow, NOT straight to the piece.

				const startCoords = boardpos.getBoardPos();
				// The direction we will follow when teleporting
				const line1GeneralForm = vectors.getLineGeneralFormFromCoordsAndVecBD(
					startCoords,
					vector,
				);
				// The line perpendicular to the target piece === The Normal
				const perpendicularSlideDir: Vec2 = vectors.getPerpendicularVector(vector);
				const line2GeneralForm = vectors.getLineGeneralFormFromCoordsAndVecBD(
					piece.coords,
					perpendicularSlideDir,
				);
				// The target teleport coords
				const telCoords = geometry.calcIntersectionPointOfLinesBD(
					...line1GeneralForm,
					...line2GeneralForm,
				)!; // We know it will be defined because they are PERPENDICULAR

				Transition.startPanTransition(telCoords, false);
			} else {
				// Mouse down
				listener.claimMouseDown(button); // Don't let the board be dragged by this mouse down, or start drawing an arrow by this finger down
			}
		}
	}
}

// Arrow Shifting: Adding / Removing Arrows before rendering ------------------------------------------------------------------------------------------------

/**
 * An Arrow Shift/Modification.
 * These take effect after update() and before render(),
 */
type Shift =
	| {
			kind: 'delete';
			start: Coords;
	  }
	| {
			kind: 'move';
			start: Coords;
			end: Coords;
	  }
	| {
			kind: 'animate';
			start: Coords;
			end: BDCoords;
			type: number;
	  }
	| {
			kind: 'add';
			type: number;
			end: Coords;
	  };

/**
 * A list of arrow modifications made by other scripts
 * after update() and before render(),
 * such as animation.js or droparrows.js
 */
let shifts: Shift[] = [];

/**
 * Piece deleted from start coords
 * => Arrow line recalculated
 */
function deleteArrow(start: Coords): void {
	if (!areArrowsActiveThisFrame()) return; // Arrow indicators are off, nothing is visible.
	overwriteArrows(start); // Filter all previous arrows that this one would overwrite.
	shifts.push({ kind: 'delete', start });
}

/**
 * Piece deleted on start coords and added on end coords
 * => Arrow lines recalculated
 */
function moveArrow(start: Coords, end: Coords): void {
	if (!areArrowsActiveThisFrame()) return; // Arrow indicators are off, nothing is visible.
	overwriteArrows(start); // Filter all previous arrows that this one would overwrite.
	shifts.push({ kind: 'move', start, end });
}

/**
 * Piece deleted on start coords. Uniquely animate arrow on floating point end coords.
 * => Recalculate start coords arrow lines.
 * @param start
 * @param end - Floating point coords of the current animation position
 * @param type - The piece type, so we know what type of piece the arrow should be.
 * 				We CANNOT just read the type of piece at the destination square, because
 * 				the piece is not gauranteed to be there. In Atomic Chess, the piece can
 * 				move, and then explode itself, leaving its destination square empty.
 */
function animateArrow(start: Coords, end: BDCoords, type: number): void {
	if (!areArrowsActiveThisFrame()) return; // Arrow indicators are off, nothing is visible.
	overwriteArrows(start); // Filter all previous arrows that this one would overwrite.
	shifts.push({ kind: 'animate', start, end, type });
}

/**
 * Piece added on end coords.
 * => Arrow lines recalculated
 */
function addArrow(type: number, end: Coords): void {
	if (!areArrowsActiveThisFrame()) return; // Arrow indicators are off, nothing is visible.
	shifts.push({ kind: 'add', type, end });
}

/**
 * Erases existing arrow shifts that should be overwritten by the new arrow.
 * Should only be called when shifting a new arrow.
 */
function overwriteArrows(start: Coords): void {
	/**
	 * For each previous shift, if either their start or end
	 * is on this start (deletion coords), then delete it!
	 *
	 * check to see if the start is the same as this end coords.
	 * If so, replace that shift with a delete action, and retain the same order.
	 */
	shifts = shifts.filter((shift) => {
		// All shift kinds with a `start` property
		if (shift.kind === 'delete' || shift.kind === 'move' || shift.kind === 'animate') {
			if (coordutil.areCoordsEqual(shift.start, start)) return false; // Filter
		}
		// All shift kinds with a Coords `end` property.
		if (shift.kind === 'move' || shift.kind === 'add') {
			if (coordutil.areCoordsEqual(shift.end, start)) return false; // Filter
		}
		return true; // Pass
	});
}

/** Execute any arrow modifications made by animation.js or arrowsdrop.js */
function executeArrowShifts(): void {
	// console.log("Executing arrow shifts");
	// console.log(jsutil.deepCopyObject(shifts));

	const gamefile = gameslot.getGamefile()!;
	const changes: Change[] = [];

	const worldHalfWidth = (width * boardpos.getBoardScaleAsNumber()) / 2; // The world-space width of our images
	const pointerWorlds = mouse.getAllPointerWorlds();

	shifts.forEach((shift) => {
		// { type: string, index?: number } & ({ start: Coords, end?: Coords } | { start?: Coords, end: Coords });
		// console.log("Processing arrow shift: ", shift);
		if (shift.kind === 'delete') {
			deletePiece(shift.start);
		} else if (shift.kind === 'add') {
			addPiece(shift.type, shift.end); // Add the piece to the gamefile, so that we can calculate the arrow lines correctly
		} else if (shift.kind === 'move') {
			const type = deletePiece(shift.start);
			if (type === undefined)
				throw Error(
					"Arrow shift: When moving arrow, no piece found at its start coords. Don't know what type of piece to add at the end coords!",
				); // If this ever happens, maybe give movePiece a type argument along just as animateArrow() has.
			addPiece(type, shift.end);
		} else if (shift.kind === 'animate') {
			deletePiece(shift.start); // Delete the piece if it is present (may not be if in Atomic Chess it blew itself up)

			// This is an arrow animation for a piece IN MOTION, not a still animation.
			// Add an animated arrow for it, since it is gonna be at a floating point coordinate

			// Only add the arrow if the piece is JUST off-screen.
			// Add 1 square on each side of the screen box first.
			const expandedFloatingBox = {
				left: bd.subtract(boundingBoxFloat!.left, ONE),
				right: bd.add(boundingBoxFloat!.right, ONE),
				bottom: bd.subtract(boundingBoxFloat!.bottom, ONE),
				top: bd.add(boundingBoxFloat!.top, ONE),
			};
			// True if its square is at least PARTIALLY visible on screen.
			// We need no arrows for the animated piece, no matter the vector!
			if (bounds.boxContainsSquareBD(expandedFloatingBox!, shift.end)) return;

			const piece: ArrowPiece = {
				type: shift.type,
				coords: shift.end,
				index: -1,
				floating: true,
			}; // Create a piece object for the arrow

			// Add an arrow for every applicable direction
			for (const lineKey of gamefile.boardsim.pieces.lines.keys()) {
				let line = vectors.getVec2FromKey(lineKey);

				if (isAnimatedArrowUnnecessary(gamefile.boardsim, piece.type, line, lineKey))
					continue; // Arrow mode isn't high enough, and the piece can't slide in the vector direction

				// Determine the line's dot product with the screen box.
				// Flip the vector if need be, to point it in the right direction.
				const thisPieceIntersections = geometry.findLineBoxIntersectionsBD(
					piece.coords,
					line,
					boundingBoxFloat!,
				);
				if (thisPieceIntersections.length < 2) continue; // Slide direction doesn't intersect with screen box, no arrow needed

				const positiveDotProduct = thisPieceIntersections[0]!.positiveDotProduct; // We know the dot product of both intersections will be identical, because the piece is off-screen.
				if (positiveDotProduct) line = vectors.negateVector(line);
				// At what point does it intersect the screen?
				const intersect = positiveDotProduct
					? thisPieceIntersections[0]!.coords
					: thisPieceIntersections[1]!.coords;

				const arrow: Arrow = processPiece(
					piece,
					line,
					intersect,
					0,
					worldHalfWidth,
					pointerWorlds,
					false,
				);
				const animatedArrow: AnimatedArrow = {
					...arrow,
					direction: line,
				};
				animatedArrows.push(animatedArrow);
			}
		}
	});

	/** Helper function to delete an arrow's start piece off the board. */
	function deletePiece(start: Coords): number | undefined {
		// Delete the piece from the gamefile, so that we can calculate the arrow lines correctly
		const originalPiece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, start);
		if (originalPiece === undefined) return; // The piece may have been blown up by itself.
		boardchanges.queueDeletePiece(changes, true, originalPiece);
		return originalPiece.type;
	}

	/** Helper function to add an arrow's end piece on the board. */
	function addPiece(type: number, end: Coords): void {
		// Add the piece to the gamefile, so that we can calculate the arrow lines correctly
		const piece: Piece = { type, coords: end, index: -1 };
		boardchanges.queueAddPiece(changes, piece);
	}

	// console.log("Applying changes:");
	// console.log(changes);

	// Apply the board changes
	boardchanges.runChanges(gamefile, changes, boardchanges.changeFuncs, true);

	shifts.forEach((shift) => {
		if (shift.kind === 'delete' || shift.kind === 'move' || shift.kind === 'animate') {
			// Recalculate the lines through the start coordinate
			recalculateLinesThroughCoords(gamefile, shift.start);
		}
		if (shift.kind === 'add' || shift.kind === 'move') {
			// Recalculate the lines through the end coordinate
			recalculateLinesThroughCoords(gamefile, shift.end);
		}
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
function recalculateLinesThroughCoords(gamefile: FullGame, coords: Coords): void {
	// console.log("Recalculating lines through coords: ", coords);
	// Recalculate every single line it is on.

	// Prevents legal move highlights from rendering for
	// the currently animated arrow indicator when hovering over its destination
	// hoveredArrows = hoveredArrows.filter(hoveredArrow => !coordutil.areCoordsEqual(hoveredArrow.piece.coords, coords));

	for (const [slideKey, linegroup] of gamefile.boardsim.pieces.lines) {
		// For each slide direction in the game...
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

		const arrowsLineDraft = calcArrowsLineDraft(
			gamefile,
			boundingBoxInt!,
			boundingBoxFloat!,
			slide,
			slideKey,
			organizedLine,
		);
		if (arrowsLineDraft === undefined) continue; // Only intersects the corner of our screen, not visible.

		// Remove Unnecessary arrows...

		const slideExceptions = getSlideExceptions();
		if (!slideExceptions.includes(slideKey)) {
			removeTypesThatCantSlideOntoScreenFromLineDraft(arrowsLineDraft);
			if (arrowsLineDraft.negDotProd.length === 0 && arrowsLineDraft.posDotProd.length === 0)
				continue; // No more pieces on this line
		}

		// Calculate more detailed information, enough to render...

		const worldHalfWidth = (width * boardpos.getBoardScaleAsNumber()) / 2;

		const pointerWorlds = mouse.getAllPointerWorlds();

		const vector = slide;
		const negVector = vectors.negateVector(slide);

		const posDotProd: Arrow[] = [];
		const negDotProd: Arrow[] = [];

		arrowsLineDraft.posDotProd.forEach((arrowDraft, index) => {
			const arrow = processPiece(
				arrowDraft.piece,
				vector,
				arrowsLineDraft.intersections[0],
				index,
				worldHalfWidth,
				pointerWorlds,
				false,
			);
			posDotProd.push(arrow);
		});

		arrowsLineDraft.negDotProd.forEach((arrowDraft, index) => {
			const arrow = processPiece(
				arrowDraft.piece,
				negVector,
				arrowsLineDraft.intersections[1],
				index,
				worldHalfWidth,
				pointerWorlds,
				false,
			);
			negDotProd.push(arrow);
		});

		slideArrows[slideKey] = slideArrows[slideKey] ?? {}; // Make sure this exists first.
		slideArrows[slideKey][lineKey] = { posDotProd, negDotProd }; // Set the new arrow line
	}
}

// Rendering ------------------------------------------------------------------------------------------------------------------------

/**
 * Renders all the arrow indicators for this frame.
 *
 * Also calls for the cached legal moves of the hovered
 * arrows to be updated.
 */
function render(): void {
	regenerateModelAndRender();
}

function regenerateModelAndRender(): void {
	if (Object.keys(slideArrows).length === 0 && animatedArrows.length === 0) return; // No visible arrows, don't generate the model

	const worldHalfWidth = (width * boardpos.getBoardScaleAsNumber()) / 2;

	// Position data of the single instance
	const left = -worldHalfWidth;
	const right = worldHalfWidth;
	const bottom = -worldHalfWidth;
	const top = worldHalfWidth;
	// Texture data of the single instance
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texright, texbottom, textop } = spritesheet.getTexDataGeneric(rotation);

	// Initialize the data arrays...

	// prettier-ignore
	const vertexData_Pictures: number[] = primitives.Quad_Texture(left, bottom, right, top, texleft, texbottom, texright, textop);
	const instanceData_Pictures: number[] = [];

	const vertexData_Arrows: number[] = getVertexDataOfArrow(worldHalfWidth);
	const instanceData_Arrows: number[] = [];

	// ADD THE DATA...

	for (const [key, value] of Object.entries(slideArrows)) {
		const vec2Key = key as Vec2Key;
		const slideLinesOfDirection = value as { [lineKey: string]: ArrowsLine };

		const slideDir = vectors.getVec2FromKey(vec2Key as Vec2Key);

		// These are swamped so the arrow always points and the opposite direction the piece is able to slide.
		const vector = vectors.negateVector(slideDir);
		const negVector = slideDir;

		for (const value of Object.values(slideLinesOfDirection)) {
			const slideLine = value as ArrowsLine;

			slideLine.posDotProd.forEach((arrow, index) =>
				concatData(instanceData_Pictures, instanceData_Arrows, arrow, vector, index),
			);
			slideLine.negDotProd.forEach((arrow, index) =>
				concatData(instanceData_Pictures, instanceData_Arrows, arrow, negVector, index),
			);
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
		vertexDataAttribInfo: [
			{ name: 'a_position', numComponents: 2 },
			{ name: 'a_texturecoord', numComponents: 2 },
		],
		instanceDataAttribInfo: [
			{ name: 'a_instanceposition', numComponents: 2 },
			{ name: 'a_instancetexcoord', numComponents: 2 },
			{ name: 'a_instancecolor', numComponents: 4 },
		],
	};
	const texture = spritesheet.getSpritesheet();
	const modelPictures = createRenderable_Instanced_GivenInfo(
		vertexData_Pictures,
		instanceData_Pictures,
		attribInfoInstancedPictures,
		'TRIANGLES',
		'arrowImages',
		[{ texture, uniformName: 'u_sampler' }],
	);

	/*
	 * The buffer model of the little arrows on
	 * the edge of the screen next to the mini piece images.
	 */
	const attribInfoInstancedArrows: AttributeInfoInstanced = {
		vertexDataAttribInfo: [{ name: 'a_position', numComponents: 2 }],
		instanceDataAttribInfo: [
			{ name: 'a_instanceposition', numComponents: 2 },
			{ name: 'a_instancecolor', numComponents: 4 },
			{ name: 'a_instancerotation', numComponents: 1 },
		],
	};
	const modelArrows = createRenderable_Instanced_GivenInfo(
		vertexData_Arrows,
		instanceData_Arrows,
		attribInfoInstancedArrows,
		'TRIANGLES',
		'arrows',
	);

	modelPictures.render();
	modelArrows.render();
}

/**
 * Takes an arrow, generates the vertex data of both the PICTURE and ARROW,
 * and appends them to their respective vertex data arrays.
 */
function concatData(
	instanceData_Pictures: number[],
	instanceData_Arrows: number[],
	arrow: Arrow,
	vector: Vec2,
	index: number,
): void {
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
	// let maxAxisDist = vectors.chebyshevDistance(boardpos.getBoardPos(), pieceCoords) - 8;
	// opacity = Math.sin(maxAxisDist / 40) * 0.5

	//							   instaceposition	   instancetexcoord  instancecolor
	instanceData_Pictures.push(...arrow.worldLocation, ...thisTexLocation, 1, 1, 1, a);

	// Next append the data of the little arrow!

	if (index > 0) return; // We can skip, since it is an adjacent picture!

	/**
	 * Our arrow's instance data needs to contain:
	 *
	 * position offset (2 numbers)
	 * unique color (4 numbers)
	 * rotation offset (1 number)
	 */

	const vectorAsDoubles = vectors.convertVectorToDoubles(vector);
	const angle = Math.atan2(vectorAsDoubles[1], vectorAsDoubles[0]); // Y value first
	//								position		  color	 rotation
	instanceData_Arrows.push(...arrow.worldLocation, 0, 0, 0, a, angle);
}

/**
 * Returns the vertex data of a single arrow instance,
 * for this frame, only containing positional information.
 * @param halfWorldWidth - Half of the width of the arrow indicators for the current frame (dependant on scale).
 */
function getVertexDataOfArrow(halfWorldWidth: number): number[] {
	const size = halfWorldWidth * 0.3; // Default size of the little arrows
	return [halfWorldWidth, -size, halfWorldWidth, size, halfWorldWidth + size, 0];
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
	// Arrow Shifting
	deleteArrow,
	moveArrow,
	animateArrow,
	addArrow,
	executeArrowShifts,
	update,
	render,
};

export type { ArrowPiece };
