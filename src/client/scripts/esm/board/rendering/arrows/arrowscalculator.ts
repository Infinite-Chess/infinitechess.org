// src/client/scripts/esm/board/rendering/arrows/arrowscalculator.ts

/**
 * This script calculates which arrow indicators should be visible on a board's
 * screen edges each frame, where they should be positioned, and which
 * are being hovered over.
 */

import type LiveBoard from '../LiveBoard.js';
import type { Board } from '../../../../../../shared/chess/logic/boardinit.js';
import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { BoundingBoxBD } from '../../../../../../shared/util/math/bounds.js';
import type { BDCoords, Coords, DoubleCoords } from '../../../../../../shared/util/coordutil.js';
import type { Arrow, ArrowPiece, HoveredArrow, ArrowsLine, SlideArrows } from './arrows.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import jsutil from '../../../../../../shared/util/jsutil.js';
import bimath from '../../../../../../shared/util/math/bimath.js';
import bounds from '../../../../../../shared/util/math/bounds.js';
import typeutil from '../../../../../../shared/chess/util/typeutil.js';
import geometry from '../../../../../../shared/util/math/geometry.js';
import bdcoords from '../../../../../../shared/util/bdcoords.js';
import boardutil from '../../../../../../shared/chess/logic/boardutil.js';
import legalmoves from '../../../../../../shared/chess/logic/legalmoves.js';
import { rawTypes as r } from '../../../../../../shared/chess/util/typeutil.js';
import vectors, { Vec2, Vec2Key } from '../../../../../../shared/util/math/vectors.js';
import organizedpieces, { LineKey } from '../../../../../../shared/chess/logic/organizedpieces.js';

import space from '../space.js';
import boardgeometry from '../boardgeometry.js';

// Types -----------------------------------------------------------------------

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
 * that is CLOSEST to you (screen center) on the line!
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
type ArrowDraft = {
	piece: ArrowPiece;
	/** Whether the piece the arrow is pointing to can legally slide at least
	 * partially into the screen, not whether it can slide in that direction EVER. */
	canSlideOntoScreen: boolean;
};

// Constants -------------------------------------------------------------------

/** The width of all pictures of the pieces and their arrows, in percentage of 1 tile. */
const WIDTH = 0.65;
/** How much padding to include between the pictures of the arrow
 * indicators and the edge of the screen, in percentage of 1 tile. */
const EDGE_GAP = 0.15; // Default: 0.15   0.1 Lines up the tip of the arrows right against the edge
/** The precalculated distance one picture's center should be from the screen edge. */
const IMAGE_EDGE_DIST: BigDecimal = bd.fromNumber(WIDTH / 2 + EDGE_GAP);
/** How much separation should be between stacked pictures pointing
 * to multiple pieces on the same line, in percentage of 1 tile. */
const STACK_PADDING = 0.35;
/** Opacity of the mini images of the pieces and arrows. */
export const OPACITY = 0.6;
/** The smallest width squares can be in virtual pixels
 * before skipping rendering arrow indicators (too small). */
const MIN_SQUARE_SIZE: BigDecimal = bd.fromBigInt(12n);

const HALF = bd.fromNumber(0.5);

// Getters ---------------------------------------------------------------------

/** Whether ANY arrow (piece or move hint) should be calculated and rendered this frame. */
export function areZoomedInEnoughForArrows(board: LiveBoard): boolean {
	const tileWidth = boardgeometry.getTileWidthPixels(
		board.camera,
		board.boardpos.getBoardScale(),
		false,
	);
	return bd.compare(tileWidth, MIN_SQUARE_SIZE) >= 0;
}

/**
 * Returns the world-space half-width of each arrow indicator's square hitbox for the current frame.
 * This is the Chebyshev-distance radius used to detect hover/opacity changes.
 */
export function getArrowIndicatorHalfWidth(board: LiveBoard): number {
	return (WIDTH * board.boardpos.getBoardScaleAsNumber()) / 2;
}

// Main entry point ------------------------------------------------------------

/** Calculates which piece arrows should be visible for a frame, once the bounding boxes are updated. */
export function calculateArrows(
	board: LiveBoard,
	boardsim: GameFile,
	pointerWorlds: DoubleCoords[],
): { slideArrows: SlideArrows; hoveredArrows: HoveredArrow[] } {
	const slideArrowsDraft = generateArrowsDraft(board, boardsim);
	removeUnnecessaryArrows(boardsim, slideArrowsDraft, board.arrows.mode);
	return calculatePieceArrows(board, boardsim, slideArrowsDraft, pointerWorlds);
}

// Bounding box ----------------------------------------------------------------

/**
 * Stores the visible bounding box of the screen for this frame,
 * both the integer-rounded-away, and the exact floating point one.
 *
 * These boxes are used to test whether a piece is visible on-screen or not.
 * As if it's not, it should get an arrow.
 * @param boundingBoxFloat - The exact bounding box of the board visible on screen. Claimed: it is padded in place.
 */
function updateBoundingBoxes(board: LiveBoard, boundingBoxFloat: BoundingBoxBD): void {
	// If any part of the square is on screen, this box rounds outward to contain it.
	board.arrows.boundingBoxInt = boardgeometry.roundAwayBoundingBox(boundingBoxFloat);

	/**
	 * Adds a little bit of padding to the bounding box, so that the arrows of the
	 * arrows indicators aren't touching the edge of the screen.
	 */
	boundingBoxFloat.left = bd.add(boundingBoxFloat.left, IMAGE_EDGE_DIST);
	boundingBoxFloat.right = bd.subtract(boundingBoxFloat.right, IMAGE_EDGE_DIST);
	boundingBoxFloat.bottom = bd.add(boundingBoxFloat.bottom, IMAGE_EDGE_DIST);
	boundingBoxFloat.top = bd.subtract(boundingBoxFloat.top, IMAGE_EDGE_DIST);
	board.arrows.boundingBoxFloat = boundingBoxFloat;
}

// Arrow draft generation ------------------------------------------------------

/**
 * Generates a draft of all the arrows for a game, as if All (plus hippogonals) mode was on.
 * This contains minimal information, as some may be removed later.
 */
function generateArrowsDraft(board: LiveBoard, gamefile: GameFile): SlideArrowsDraft {
	/** The running list of arrows that should be visible */
	const slideArrowsDraft: SlideArrowsDraft = {};
	const boundingBoxInt = board.arrows.boundingBoxInt!;
	gamefile.pieces.lines.forEach(({ step, lines }, slideKey) => {
		// For each slide direction in the game...

		// Find the 2 points on opposite sides of the bounding box
		// that will contain all organized lines of the given vector
		// intersecting the box between them.

		const containingPoints = geometry.findCrossSectionalWidthPoints(step, boundingBoxInt);
		const containingPointsLineC = containingPoints.map((point) =>
			vectors.getLineCFromCoordsAndVec(point, step),
		) as [bigint, bigint];
		// Any line of this slope of which its C value is not within these 2 are outside of our screen,
		// so no arrows will be visible for the piece.
		containingPointsLineC.sort((a, b) => bimath.compare(a, b)); // Sort them so C is ascending. Then index 0 will be the minimum and 1 will be the max.

		// For all our lines in the game with this slope...
		for (const [lineKey, organizedLine] of lines) {
			// The C of the lineKey (`C|X`) with this slide at the very left & right sides of the screen.
			const C: bigint = organizedpieces.getCFromKey(lineKey);
			if (
				bimath.compare(C, containingPointsLineC[0]) < 0 ||
				bimath.compare(C, containingPointsLineC[1]) > 0
			)
				continue; // Next line, this one is off-screen, so no piece arrows are visible

			// Calculate the ACTUAL arrows that should be visible for this specific organized line.
			const arrowsLine = calcArrowsLineDraft(board, gamefile, step, slideKey, organizedLine);
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
 * stacked on each other in the same line, since Huygens
 * can jump/skip over other pieces.
 */
export function calcArrowsLineDraft(
	board: LiveBoard,
	gamefile: GameFile,
	slideDir: Vec2,
	slideKey: Vec2Key,
	organizedline: number[],
): ArrowsLineDraft | undefined {
	const negDotProd: ArrowDraft[] = [];
	const posDotProd: ArrowDraft[] = [];

	/** The innermost piece on the side that is closest to us (screen center). */
	let closestPosDotProd: ArrowDraft | undefined;
	/** The innermost piece on the side that is closest to us (screen center). */
	let closestNegDotProd: ArrowDraft | undefined;

	const axis = slideDir[0] === 0n ? 1 : 0;
	const boundingBoxFloat = board.arrows.boundingBoxFloat!;

	const firstPiece = boardutil.getDefinedPieceFromIdx(gamefile.pieces, organizedline[0]!);

	/**
	 * The 2 intersections points of the whole organized line, consistent for every piece on it.
	 * The only difference is each piece may have a different dot product,
	 * which just means it's on the opposite side.
	 */
	const intersections = geometry
		.findLineBoxIntersectionsBD(
			bdcoords.fromCoords(firstPiece.coords),
			slideDir,
			boundingBoxFloat,
		)
		.map((c) => c.coords);
	if (intersections.length < 2) return; // Arrow line intersected screen box exactly on the corner!! Let's skip constructing this line. No arrow will be visible

	const boundingBoxIntBD = bounds.castBoundingBoxToBigDecimal(board.arrows.boundingBoxInt!);

	organizedline.forEach((idx) => {
		const piece = boardutil.getDefinedPieceFromIdx(gamefile.pieces, idx);
		const arrowPiece: ArrowPiece = {
			type: piece.type,
			coords: bdcoords.fromCoords(piece.coords),
			index: piece.index,
			floating: false,
		};

		// Is the piece off-screen?
		if (bounds.boxContainsSquareBD(boundingBoxIntBD, arrowPiece.coords)) return; // On-screen, no arrow needed

		// Piece is guaranteed off-screen...

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
		 * Calculate its maximum slide.
		 *
		 * If it is able to slide (ignoring ignore function, and ignoring check respection)
		 * into our screen area, then it should be guaranteed an arrow,
		 * EVEN if it's not the closest piece to us on the line
		 * (which would mean it phased/skipped over pieces due to a custom blocking function)
		 */

		// prettier-ignore
		const slideLegalLimit = legalmoves.calcPiecesLegalSlideLimitOnSpecificLine(gamefile, gamefile.gameRules.worldBorder, piece, slideDir, slideKey, organizedline);
		if (slideLegalLimit === undefined) return; // This piece can't slide along the direction of travel

		/**
		 * It CAN slide along our direction of travel...
		 * But can it slide far enough where it can reach our screen?
		 *
		 * We already know the intersection points of its slide with the screen box.
		 *
		 * Next, how do we test if its legal slide protrudes into the screen?
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
		firstIntersectionDist = bd.subtract(firstIntersectionDist, IMAGE_EDGE_DIST);

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

// Mode-based filtering --------------------------------------------------------

/**
 * Removes arrows based on the mode.
 *
 * mode == 1: Removes arrows to ONLY include the pieces which can legally slide into our screen (which may include hippogonals)
 * mode == 2: Everything in mode 1, PLUS all orthogonals and diagonals, whether or not the piece can slide into our screen
 * mode == 3: Everything in mode 1 & 2, PLUS all hippogonals, whether or not the piece can slide into our screen
 */
function removeUnnecessaryArrows(
	boardsim: Board,
	slideArrowsDraft: SlideArrowsDraft,
	mode: 0 | 1 | 2 | 3,
): void {
	if (mode === 3) return; // Don't remove anything

	const slideExceptions = getSlideExceptions(boardsim, mode);

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
	// Mode 2 keeps all orthogonals and diagonals, regardless of whether the piece can slide there.
	// Hippogonals (and greater) fall through to the mode 1 check, so mode 2 stays additive over mode 1.
	if (mode === 2 && vectors.chebyshevDistance([0n, 0n], direction) === 1n) return false;

	// mode 1 (or mode 2 hippogonals): only keep it if the piece can slide in the direction, whether blocked or not
	const thisPieceMoveset = legalmoves.getPieceMoveset(boardsim, type); // Default piece moveset
	if (!thisPieceMoveset.sliding) return true; // This piece can't slide at all
	if (!thisPieceMoveset.sliding[dirKey]) return true; // This piece can't slide ALONG the provided line
	// This piece CAN slide along the provided line...
	return false;
}

/**
 * Returns the slide directions that should be retained regardless of
 * whether the piece can actually slide onto our screen in that direction.
 *
 * Mode 3 returns EVERY slide direction (all are exceptions).
 * Mode 2 returns all orthogonal and diagonal vectors.
 * Modes 0 & 1 return nothing, because retention depends on whether the
 * piece can slide into the direction of the vector, and onto our screen.
 */
export function getSlideExceptions(gamefile: Board, mode: 0 | 1 | 2 | 3): Vec2Key[] {
	// Mode 3 retains every slide direction, whether orthogonal, diagonal, or hippogonal+.
	if (mode === 3) return Array.from(gamefile.pieces.lines.keys());
	// Mode 2 retains all orthogonals and diagonals, EVEN if they can't slide in that direction.
	if (mode === 2)
		return Array.from(gamefile.pieces.lines)
			.filter(([, { step }]) => vectors.chebyshevDistance([0n, 0n], step) === 1n) // Filter out all hippogonal and greater vectors
			.map(([slideKey]) => slideKey);
	return [];
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

// Finalizing arrows -----------------------------------------------------------

/**
 * Converts all arrow drafts into fully computed arrows with world-space positions
 * and hover detection. Collects all hovered arrows.
 */
function calculatePieceArrows(
	board: LiveBoard,
	boardsim: Board,
	slideArrowsDraft: SlideArrowsDraft,
	pointerWorlds: DoubleCoords[],
): { slideArrows: SlideArrows; hoveredArrows: HoveredArrow[] } {
	const slideArrows: SlideArrows = {};
	const hoveredArrows: HoveredArrow[] = [];

	const worldHalfWidth = getArrowIndicatorHalfWidth(board);

	for (const vec2Key of Object.keys(slideArrowsDraft) as Vec2Key[]) {
		const linesOfDirectionDraft = slideArrowsDraft[vec2Key]!;
		const slideDir = vectors.getVec2FromKey(vec2Key);
		const linesOfDirection: { [lineKey: string]: ArrowsLine } = {};

		for (const lineKey of Object.keys(linesOfDirectionDraft)) {
			const arrowLineDraft = linesOfDirectionDraft[lineKey]!;
			// prettier-ignore
			const { line, newHoveredArrows } = convertLineDraftToLine(board, boardsim, arrowLineDraft, slideDir, vec2Key, worldHalfWidth, pointerWorlds, true);
			linesOfDirection[lineKey] = line;
			hoveredArrows.push(...newHoveredArrows);
		}

		slideArrows[vec2Key] = linesOfDirection;
	}

	return { slideArrows, hoveredArrows };
}

/**
 * Converts an {@link ArrowsLineDraft} into a fully computed {@link ArrowsLine},
 * resolving world-space positions and hover detection for each arrow.
 * @param appendHover - When true, also computes ownsSlide and collects hovered arrows.
 */
export function convertLineDraftToLine(
	board: LiveBoard,
	boardsim: Board,
	draft: ArrowsLineDraft,
	slideDir: Vec2,
	vec2Key: Vec2Key,
	worldHalfWidth: number,
	pointerWorlds: DoubleCoords[],
	appendHover: boolean,
): { line: ArrowsLine; newHoveredArrows: HoveredArrow[] } {
	const negVector = vectors.negateVector(slideDir);
	const newHoveredArrows: HoveredArrow[] = [];

	const toArrow = (
		dir: Vec2,
		intersection: BDCoords,
		arrowDraft: ArrowDraft,
		index: number,
	): Arrow => {
		// prettier-ignore
		const arrow = processPiece(board, arrowDraft.piece, dir, intersection, index, worldHalfWidth, pointerWorlds);
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
 * @param vector - A vector pointing TOWARD the piece (from screen edge outward). Used for adjacent-picture offsets.
 * @param intersection - The intersection with the screen window that the line the piece is on intersects.
 * @param stackIndex - If there are adjacent pictures, this may be > 0
 * @param worldHalfWidth
 * @param pointerWorlds - A list of all world coordinates every existing pointer is over.
 */
export function processPiece(
	board: LiveBoard,
	piece: ArrowPiece,
	vector: Vec2,
	intersection: BDCoords,
	stackIndex: number,
	worldHalfWidth: number,
	pointerWorlds: DoubleCoords[],
): Arrow {
	const renderCoords = intersection; // Don't think we need to deep copy?

	const worldLocation: DoubleCoords = space.convertCoordToWorldSpace_IgnoreSquareCenter(
		renderCoords,
		board.boardpos.getBoardPos(),
		board.boardpos.getBoardScale(),
	);

	// If this picture is a stacked picture, adjust it's positioning
	if (stackIndex > 0) {
		const scale = board.boardpos.getBoardScaleAsNumber();
		worldLocation[0] += Number(vector[0]) * stackIndex * STACK_PADDING * scale;
		worldLocation[1] += Number(vector[1]) * stackIndex * STACK_PADDING * scale;
	}

	// Does the mouse hover over the piece?
	let hovered = false;
	for (const pointerWorld of pointerWorlds) {
		const chebyshevDist = vectors.chebyshevDistanceDoubles(worldLocation, pointerWorld);
		if (chebyshevDist < worldHalfWidth) hovered = true; // Mouse inside the picture bounding box
	}

	const direction = vectors.negateVector(vector);
	return { worldLocation, piece, hovered, opacity: OPACITY, direction, stackIndex };
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	OPACITY,
	// Getters
	areZoomedInEnoughForArrows,
	getArrowIndicatorHalfWidth,
	// Main entry point
	calculateArrows,
	// Bounding box
	updateBoundingBoxes,
	// Arrow draft generation
	calcArrowsLineDraft,
	// Mode-based filtering
	isAnimatedArrowUnnecessary,
	getSlideExceptions,
	removeTypesThatCantSlideOntoScreenFromLineDraft,
	// Finalizing arrows
	convertLineDraftToLine,
	processPiece,
};
