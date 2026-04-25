// src/client/scripts/esm/game/rendering/arrows/arrowscalculator.ts

/**
 * This script calculates which arrow indicators should be visible on the
 * screen edges each frame, where they should be positioned, and which
 * are being hovered over.
 *
 * It also computes hint arrows for off-screen legal move destinations.
 */

import type { Board, FullGame } from '../../../../../../shared/chess/logic/gamefile.js';
import type { BoundingBox, BoundingBoxBD } from '../../../../../../shared/util/math/bounds.js';
import type {
	Arrow,
	ArrowPiece,
	HoveredArrow,
	HintArrow,
	ArrowsLine,
	SlideArrows,
} from './arrows.js';
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
import { rawTypes as r } from '../../../../../../shared/chess/util/typeutil.js';
import vectors, { Vec2, Vec2Key } from '../../../../../../shared/util/math/vectors.js';
import organizedpieces, { LineKey } from '../../../../../../shared/chess/logic/organizedpieces.js';
import bounds from '../../../../../../shared/util/math/bounds.js';

import space from '../../misc/space.js';
import mouse from '../../../util/mouse.js';
import gameslot from '../../chess/gameslot.js';
import boardpos from '../boardpos.js';
import movehints from '../highlights/movehints.js';
import boardtiles from '../boardtiles.js';
import Transition from '../transitions/Transition.js';
import perspective from '../perspective.js';
import guinavigation from '../../gui/guinavigation.js';
import guigameinfo from '../../gui/guigameinfo.js';
import { InputListener, Mouse, MouseButton } from '../../input.js';
import { listener_overlay } from '../../chess/game.js';

// Types -------------------------------------------------------------------------------

/**
 * An object containing all the arrow lines of a single frame,
 * BEFORE removing excess arrows due to our mode.
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
 * BEFORE removing excess arrows due to our mode.
 *
 * The FIRST index in each of these left/right arrays, is the picture
 * which gets rendered at the default location.
 * The FINAL index in each of these, is the picture of the piece
 * that is CLOSEST to you (or the screen) on the line!
 */
export interface ArrowsLineDraft {
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

// Constants ---------------------------------------------------------------------------

/** The width of the mini images of the pieces and arrows, in percentage of 1 tile. */
const WIDTH = 0.65;
/** How much padding to include between the mini image of the pieces & arrows and the edge of the screen, in percentage of 1 tile. */
const sidePadding = 0.15; // Default: 0.15   0.1 Lines up the tip of the arrows right against the edge
/** The distance one arrow's picture's center should be from the screen edge. */
const PADDING: BigDecimal = bd.fromNumber(WIDTH / 2 + sidePadding);
/** How much separation between adjacent pictures pointing to multiple pieces on the same line, in percentage of 1 tile. */
const paddingBetwAdjacentPictures = 0.35;
/** Opacity of the mini images of the pieces and arrows. */
export const opacity = 0.6;
/** When we're zoomed out far enough that 1 tile is as wide as this many virtual pixels, we don't render the arrow indicators. */
const renderZoomLimitVirtualPixels: BigDecimal = bd.fromBigInt(12n); // virtual pixels. Default: 20

/** The distance in perspective mode to render the arrow indicators from the camera.
 * We need this because there is no normal edge of the screen like in 2D mode. */
const perspectiveDist = 17;

const HALF = bd.fromNumber(0.5);

// State -------------------------------------------------------------------------------

/**
 * The bounding box of the screen for this frame.
 */
let boundingBoxFloat: BoundingBoxBD | undefined;
/**
 * The bounding box of the screen for this frame,
 * rounded outward to contain the entirety of
 * any square even partially visible.
 */
let boundingBoxInt: BoundingBox | undefined;

// Getters -----------------------------------------------------------------------------

export function getBoundingBoxFloat(): BoundingBoxBD | undefined {
	return boundingBoxFloat;
}

export function getBoundingBoxInt(): BoundingBox | undefined {
	return boundingBoxInt;
}

/** Whether ANY arrow (piece or move hint) should be calculated and rendered this frame. */
export function areZoomedInEnoughForArrows(): boolean {
	return bd.compare(boardtiles.gtileWidth_Pixels(false), renderZoomLimitVirtualPixels) >= 0;
}

/**
 * Returns the world-space half-width of each arrow indicator's square hitbox for the current frame.
 * This is the Chebyshev-distance radius used to detect hover/opacity changes.
 */
export function getArrowIndicatorHalfWidth(): number {
	return (WIDTH * boardpos.getBoardScaleAsNumber()) / 2;
}

// Main entry point --------------------------------------------------------------------

/**
 * Calculates which arrows should be visible for a frame.
 * Always computes bounding boxes and hint arrows.
 * Only computes slide arrows when the mode is non-zero and zoom is sufficient.
 *
 * @returns active - whether slide arrows are active this frame
 */
export function calculateArrows(mode: 0 | 1 | 2 | 3): {
	active: boolean;
	slideArrows: SlideArrows;
	hoveredArrows: HoveredArrow[];
	hintArrows: HintArrow[];
} {
	updateBoundingBoxesOfVisibleScreen();
	const newHintArrows = updateHintArrows();

	if (mode === 0 || !areZoomedInEnoughForArrows()) {
		return { active: false, slideArrows: {}, hoveredArrows: [], hintArrows: newHintArrows };
	}

	const slideArrowsDraft = generateArrowsDraft();
	removeUnnecessaryArrows(slideArrowsDraft, mode);
	const { slideArrows, hoveredArrows } = calculateSlideArrows_AndHovered(slideArrowsDraft);
	return { active: true, slideArrows, hoveredArrows, hintArrows: newHintArrows };
}

// Bounding box ------------------------------------------------------------------------

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
	boundingBoxFloat.left = bd.add(boundingBoxFloat.left, PADDING);
	boundingBoxFloat.right = bd.subtract(boundingBoxFloat.right, PADDING);
	boundingBoxFloat.bottom = bd.add(boundingBoxFloat.bottom, PADDING);
	boundingBoxFloat.top = bd.subtract(boundingBoxFloat.top, PADDING);
}

// Arrow draft generation --------------------------------------------------------------

/**
 * Generates a draft of all the arrows for a game, as if All (plus hippogonals) mode was on.
 * This contains minimal information, as some may be removed later.
 */
function generateArrowsDraft(): SlideArrowsDraft {
	/** The running list of arrows that should be visible */
	const slideArrowsDraft: SlideArrowsDraft = {};
	const gamefile = gameslot.getGamefile()!;
	gamefile.boardsim.pieces.slides.forEach((slide: Vec2) => {
		// For each slide direction in the game...
		const slideKey: Vec2Key = vectors.getKeyFromVec2(slide);

		// Find the 2 points on opposite sides of the bounding box
		// that will contain all organized lines of the given vector
		// intersecting the box between them.

		const containingPoints = geometry.findCrossSectionalWidthPoints(slide, boundingBoxInt!);
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
			const arrowsLine = calcArrowsLineDraft(gamefile, slide, slideKey, organizedLine);
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
 * next to each other on the same line, since Huygens
 * can jump/skip over other pieces.
 */
export function calcArrowsLineDraft(
	gamefile: FullGame,
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
			boundingBoxFloat!,
		)
		.map((c) => c.coords);
	if (intersections.length < 2) return; // Arrow line intersected screen box exactly on the corner!! Let's skip constructing this line. No arrow will be visible

	const boundingBoxIntBD = bounds.castBoundingBoxToBigDecimal(boundingBoxInt!);

	organizedline.forEach((idx) => {
		const piece = boardutil.getPieceFromIdx(gamefile.boardsim.pieces, idx)!;
		const arrowPiece: ArrowPiece = {
			type: piece.type,
			coords: bdcoords.FromCoords(piece.coords),
			index: piece.index,
			floating: false,
		};

		// Is the piece off-screen?
		if (bounds.boxContainsSquareBD(boundingBoxIntBD, arrowPiece.coords)) return; // On-screen, no arrow needed

		// Piece is guaranteed off-screen...

		const thisPieceIntersections = geometry.findLineBoxIntersectionsBD(
			arrowPiece.coords,
			slideDir,
			boundingBoxFloat!,
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
		firstIntersectionDist = bd.subtract(firstIntersectionDist, PADDING);

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
		typeutil.getRawType(closestPosDotProd.piece.type) !== r.VOID
	)
		posDotProd.push(closestPosDotProd);
	if (
		closestNegDotProd !== undefined &&
		!negDotProd.includes(closestNegDotProd) &&
		typeutil.getRawType(closestNegDotProd.piece.type) !== r.VOID
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

	return { negDotProd, posDotProd, intersections: intersections as [BDCoords, BDCoords] };
}

// Mode-based filtering ----------------------------------------------------------------

/**
 * Removes arrows based on the mode.
 *
 * mode == 1: Removes arrows to ONLY include the pieces which can legally slide into our screen (which may include hippogonals)
 * mode == 2: Everything in mode 1, PLUS all orthogonals and diagonals, whether or not the piece can slide into our screen
 * mode == 3: Everything in mode 1 & 2, PLUS all hippogonals, whether or not the piece can slide into our screen
 */
function removeUnnecessaryArrows(slideArrowsDraft: SlideArrowsDraft, mode: 0 | 1 | 2 | 3): void {
	if (mode === 3) return; // Don't remove anything

	const slideExceptions = getSlideExceptions(mode);

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
export function isAnimatedArrowUnnecessary(
	boardsim: Board,
	type: number,
	direction: Vec2,
	dirKey: Vec2Key,
	mode: 0 | 1 | 2 | 3,
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
 * the piece can slide into the direction of the vector, and onto our screen.
 */
export function getSlideExceptions(mode: 0 | 1 | 2 | 3): Vec2Key[] {
	const gamefile = gameslot.getGamefile()!;
	let slideExceptions: Vec2Key[] = [];
	// If we're in mode 2, retain all orthogonals and diagonals, EVEN if they can't slide in that direction.
	if (mode === 2)
		slideExceptions = gamefile.boardsim.pieces.slides
			.filter((slideDir: Vec2) => vectors.chebyshevDistance([0n, 0n], slideDir) === 1n)
			.map((v) => vectors.getKeyFromVec2(v)); // Filter out all hippogonal and greater vectors
	return slideExceptions;
}

export function removeTypesThatCantSlideOntoScreenFromLineDraft(line: ArrowsLineDraft): void {
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

// Finalizing arrows -------------------------------------------------------------------

/**
 * Converts all arrow drafts into fully computed arrows with world-space positions
 * and hover detection. Collects all hovered arrows.
 */
function calculateSlideArrows_AndHovered(slideArrowsDraft: SlideArrowsDraft): {
	slideArrows: SlideArrows;
	hoveredArrows: HoveredArrow[];
} {
	const newSlideArrows: SlideArrows = {};
	const allHoveredArrows: HoveredArrow[] = [];

	const worldHalfWidth = getArrowIndicatorHalfWidth();
	const pointerWorlds = mouse.getAllPointerWorlds();

	for (const vec2Key of Object.keys(slideArrowsDraft) as Vec2Key[]) {
		const linesOfDirectionDraft = slideArrowsDraft[vec2Key]!;
		const slideDir = vectors.getVec2FromKey(vec2Key);
		const linesOfDirection: { [lineKey: string]: ArrowsLine } = {};

		for (const lineKey of Object.keys(linesOfDirectionDraft)) {
			const arrowLineDraft = linesOfDirectionDraft[lineKey]!;
			const { line, newHoveredArrows } = convertLineDraftToLine(
				arrowLineDraft,
				slideDir,
				vec2Key,
				worldHalfWidth,
				pointerWorlds,
				true,
			);
			linesOfDirection[lineKey] = line;
			allHoveredArrows.push(...newHoveredArrows);
		}

		newSlideArrows[vec2Key] = linesOfDirection;
	}

	return { slideArrows: newSlideArrows, hoveredArrows: allHoveredArrows };
}

/**
 * Converts an {@link ArrowsLineDraft} into a fully computed {@link ArrowsLine},
 * resolving world-space positions and hover detection for each arrow.
 * When appendHover is true, also computes ownsSlide and collects hovered arrows.
 */
export function convertLineDraftToLine(
	draft: ArrowsLineDraft,
	slideDir: Vec2,
	vec2Key: Vec2Key,
	worldHalfWidth: number,
	pointerWorlds: DoubleCoords[],
	appendHover: boolean,
): { line: ArrowsLine; newHoveredArrows: HoveredArrow[] } {
	const negVector = vectors.negateVector(slideDir);
	const boardsim = gameslot.getGamefile()!.boardsim!;
	const newHoveredArrows: HoveredArrow[] = [];

	const toArrow = (
		dir: Vec2,
		intersection: BDCoords,
		arrowDraft: ArrowDraft,
		index: number,
	): Arrow => {
		// prettier-ignore
		const arrow = processPiece(arrowDraft.piece, dir, intersection, index, worldHalfWidth, pointerWorlds);
		if (appendHover && arrow.hovered) {
			const moveset = legalmoves.getPieceMoveset(boardsim, arrowDraft.piece.type);
			const ownsSlide = !!(moveset.sliding && moveset.sliding[vec2Key]);

			newHoveredArrows.push({
				piece: arrow.piece,
				direction: arrow.direction,
				worldLocation: arrow.worldLocation,
				ownsSlide,
			});
		}
		return arrow;
	};

	const line: ArrowsLine = {
		posDotProd: draft.posDotProd.map((ad, i) =>
			toArrow(slideDir, draft.intersections[0], ad, i),
		),
		negDotProd: draft.negDotProd.map((ad, i) =>
			toArrow(negVector, draft.intersections[1], ad, i),
		),
	};
	return { line, newHoveredArrows };
}

/**
 * Calculates the detailed information about a single arrow indicator, enough to be able to render.
 * @param piece
 * @param vector - A vector pointing TOWARD the piece (from screen edge outward). Used for adjacent-picture offsets and click transitions.
 * @param intersection - The intersection with the screen window that the line the piece is on intersects.
 * @param stackIndex - If there are adjacent pictures, this may be > 0
 * @param worldHalfWidth
 * @param pointerWorlds - A list of all world coordinates every existing pointer is over.
 * @returns
 */
export function processPiece(
	piece: ArrowPiece,
	vector: Vec2,
	intersection: BDCoords,
	stackIndex: number,
	worldHalfWidth: number,
	pointerWorlds: DoubleCoords[],
): Arrow {
	const renderCoords = intersection; // Don't think we need to deep copy?

	const worldLocation: DoubleCoords =
		space.convertCoordToWorldSpace_IgnoreSquareCenter(renderCoords);

	// If this picture is an adjacent picture, adjust it's positioning
	if (stackIndex > 0) {
		const scale = boardpos.getBoardScaleAsNumber();
		worldLocation[0] += Number(vector[0]) * stackIndex * paddingBetwAdjacentPictures * scale;
		worldLocation[1] += Number(vector[1]) * stackIndex * paddingBetwAdjacentPictures * scale;
	}

	// Does the mouse hover over the piece?
	let hovered = false;
	for (const pointerWorld of pointerWorlds) {
		const chebyshevDist = vectors.chebyshevDistanceDoubles(worldLocation, pointerWorld);
		if (chebyshevDist < worldHalfWidth) hovered = true; // Mouse inside the picture bounding box
	}
	// Teleports toward the given piece if its arrow indicator is clicked this frame.
	transitionTowardTargetIfClicked(piece.coords, vector, worldLocation, worldHalfWidth);

	const direction = vectors.negateVector(vector);
	return { worldLocation, piece, hovered, opacity, direction, stackIndex };
}

/**
 * If a recognized click falls within worldHalfWidth of
 * worldLocation, claims it and pans towards the target coordinates.
 */
export function transitionTowardTargetIfClicked(
	targetCoords: BDCoords,
	direction: Vec2,
	worldLocation: DoubleCoords,
	worldHalfWidth: number,
): void {
	let button: MouseButton;
	let listener: typeof mouse | InputListener;

	// Left mouse button
	if (mouse.isMouseClicked(Mouse.LEFT)) {
		button = Mouse.LEFT;
		listener = mouse;
	}
	// Finger simulating right mouse down (annotations mode ON)
	else if (
		listener_overlay.isMouseClicked(Mouse.RIGHT) &&
		listener_overlay.isMouseTouch(Mouse.RIGHT)
	) {
		button = Mouse.RIGHT;
		listener = listener_overlay;
	} else return; // No recognized click

	const clickWorld = mouse.getMouseWorld(button);
	if (!clickWorld) return; // Maybe we're looking into sky?
	if (vectors.chebyshevDistanceDoubles(worldLocation, clickWorld) >= worldHalfWidth) return;
	// Mouse is inside the picture bounding box...
	listener.claimMouseClick(button); // Don't let annotations erase/draw

	// Pan along parallel direction to the perpendicular foot of targetCoords, NOT straight to the piece.

	const startCoords = boardpos.getBoardPos();
	// The direction we will follow when teleporting
	const line1GeneralForm = vectors.getLineGeneralFormFromCoordsAndVecBD(startCoords, direction);
	// The line perpendicular to the target piece === The Normal
	const perpendicularSlideDir: Vec2 = vectors.getPerpendicularVector(direction);
	const line2GeneralForm = vectors.getLineGeneralFormFromCoordsAndVecBD(
		targetCoords,
		perpendicularSlideDir,
	);
	// The target teleport coords
	const telCoords = geometry.calcIntersectionPointOfLinesBD(
		...line1GeneralForm,
		...line2GeneralForm,
	)!; // We know it will be defined because they are PERPENDICULAR

	Transition.startPanTransition(telCoords, false);
}

// Hint Arrows -------------------------------------------------------------------------

/**
 * Computes hint arrows for the current frame.
 * For each off-screen square returned by {@link movehints.getSquares},
 * creates a hint arrow at the nearest screen edge pointing toward that square.
 *
 * Respects the zoom threshold but ignores the current arrow mode,
 * so hint arrows are visible even when mode is 0 (off).
 */
function updateHintArrows(): HintArrow[] {
	const hintSquares = movehints.getSquares();
	if (hintSquares.length === 0) return [];
	if (!areZoomedInEnoughForArrows()) return [];

	const pieceCoords = movehints.getPieceCoords()!;

	const worldHalfWidth = getArrowIndicatorHalfWidth();
	const pointerWorlds = mouse.getAllPointerWorlds();
	const newHintArrows: HintArrow[] = [];

	for (const hintSquare of hintSquares) {
		const hintSquareBD = bdcoords.FromCoords(hintSquare);

		// Skip if the hint square is already visible on screen
		if (bounds.boxContainsSquare(boundingBoxInt!, hintSquare)) continue;

		// Direction from the selected piece toward the hint square
		const difference = coordutil.subtractCoords(hintSquare, pieceCoords);
		let direction: Vec2 = vectors.normalizeVector(difference);

		// Calculate the world space position of the near-side screen edge intersection
		// along the line from the piece to the hint square.
		const intersections = geometry.findLineBoxIntersectionsBD(
			hintSquareBD,
			direction,
			boundingBoxFloat!,
		);
		if (intersections.length < 2) continue;
		const nearSide = intersections[0]!.positiveDotProduct
			? intersections[0]!.coords
			: intersections[1]!.coords;
		const worldLocation = space.convertCoordToWorldSpace_IgnoreSquareCenter(nearSide);

		// If we've panned past the hint square, flip the triangle so it still points toward the square
		if (intersections[0]!.positiveDotProduct) direction = vectors.negateVector(direction);

		// Whether any pointer is within worldHalfWidth of the given world location.
		const hovered = pointerWorlds.some(
			(p) => vectors.chebyshevDistanceDoubles(worldLocation, p) < worldHalfWidth,
		);
		// Prevent dragging the board when clicking on the move hint arrow.
		if (hovered && mouse.isMouseDown(Mouse.LEFT)) mouse.claimMouseDown(Mouse.LEFT);

		transitionTowardTargetIfClicked(hintSquareBD, direction, worldLocation, worldHalfWidth);

		newHintArrows.push({ worldLocation, direction, targetSquare: hintSquare, hovered });
	}

	return newHintArrows;
}

// Exports -----------------------------------------------------------------------------

export default {
	calculateArrows,
	getBoundingBoxFloat,
	getBoundingBoxInt,
	areZoomedInEnoughForArrows,
	getArrowIndicatorHalfWidth,
	getSlideExceptions,
	isAnimatedArrowUnnecessary,
	calcArrowsLineDraft,
	removeTypesThatCantSlideOntoScreenFromLineDraft,
	convertLineDraftToLine,
	processPiece,
	opacity,
};
