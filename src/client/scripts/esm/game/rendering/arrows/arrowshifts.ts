// src/client/scripts/esm/game/rendering/arrows/arrowshifts.ts

/**
 * This script manages mid-frame arrow modifications (shifts).
 *
 * Other scripts call deleteArrow(), moveArrow(), animateArrow(), and addArrow()
 * between the arrows update() and render() calls. Those shifts are then
 * applied all at once by executeArrowShifts() before rendering.
 */

import type { Piece } from '../../../../../../shared/chess/util/boardutil.js';
import type { Change } from '../../../../../../shared/chess/logic/boardchanges.js';
import type { Vec2Key } from '../../../../../../shared/util/math/vectors.js';
import type { FullGame } from '../../../../../../shared/chess/logic/gamefile.js';
import type { Arrow, ArrowPiece, SlideArrows } from './arrows.js';
import type {
	BDCoords,
	Coords,
	DoubleCoords,
} from '../../../../../../shared/chess/util/coordutil.js';

import bd from '@naviary/bigdecimal';

import bounds from '../../../../../../shared/util/math/bounds.js';
import vectors from '../../../../../../shared/util/math/vectors.js';
import geometry from '../../../../../../shared/util/math/geometry.js';
import coordutil from '../../../../../../shared/chess/util/coordutil.js';
import boardutil from '../../../../../../shared/chess/util/boardutil.js';
import boardchanges from '../../../../../../shared/chess/logic/boardchanges.js';
import organizedpieces from '../../../../../../shared/chess/logic/organizedpieces.js';

import mouse from '../../../util/mouse.js';
import gameslot from '../../chess/gameslot.js';
import arrowscalculator from './arrowscalculator.js';

// Types -------------------------------------------------------------------------------

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

// State -------------------------------------------------------------------------------

const ONE = bd.fromBigInt(1n);

/**
 * A list of arrow modifications made by other scripts
 * after update() and before render(),
 * such as animation.js or droparrows.js
 */
let shifts: Shift[] = [];

// Functions ---------------------------------------------------------------------------

/** Clears the pending shifts list. Called from arrows.reset() at the start of each frame. */
export function resetShifts(): void {
	shifts.length = 0;
}

/**
 * Piece deleted from start coords
 * => Arrow line recalculated
 */
export function deleteArrow(start: Coords, areArrowsActive: boolean): void {
	if (!areArrowsActive) return;
	overwriteArrows(start);
	shifts.push({ kind: 'delete', start });
}

/**
 * Piece deleted on start coords and added on end coords
 * => Arrow lines recalculated
 */
export function moveArrow(start: Coords, end: Coords, areArrowsActive: boolean): void {
	if (!areArrowsActive) return;
	overwriteArrows(start);
	shifts.push({ kind: 'move', start, end });
}

/**
 * Piece deleted on start coords. Uniquely animate arrow on floating point end coords.
 * => Recalculate start coords arrow lines.
 * @param start
 * @param end - Floating point coords of the current animation position
 * @param type - The piece type, so we know what type of piece the arrow should be.
 * 				We CANNOT just read the type of piece at the destination square, because
 * 				the piece is not guaranteed to be there. In Atomic Chess, the piece can
 * 				move, and then explode itself, leaving its destination square empty.
 */
export function animateArrow(
	start: Coords,
	end: BDCoords,
	type: number,
	areArrowsActive: boolean,
): void {
	if (!areArrowsActive) return;
	overwriteArrows(start);
	shifts.push({ kind: 'animate', start, end, type });
}

/**
 * Piece added on end coords.
 * => Arrow lines recalculated
 */
export function addArrow(type: number, end: Coords, areArrowsActive: boolean): void {
	if (!areArrowsActive) return;
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
export function executeArrowShifts(
	slideArrows: SlideArrows,
	animatedArrows: Arrow[],
	mode: 0 | 1 | 2 | 3,
): void {
	const gamefile = gameslot.getGamefile()!;
	const changes: Change[] = [];

	const worldHalfWidth = arrowscalculator.getArrowIndicatorHalfWidth();
	const pointerWorlds = mouse.getAllPointerWorlds();
	const slideExceptions = arrowscalculator.getSlideExceptions(mode);

	shifts.forEach((shift) => {
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
			const boundingBoxFloat = arrowscalculator.getBoundingBoxFloat()!;
			const expandedFloatingBox = {
				left: bd.subtract(boundingBoxFloat.left, ONE),
				right: bd.add(boundingBoxFloat.right, ONE),
				bottom: bd.subtract(boundingBoxFloat.bottom, ONE),
				top: bd.add(boundingBoxFloat.top, ONE),
			};
			// True if its square is at least PARTIALLY visible on screen.
			// We need no arrows for the animated piece, no matter the vector!
			if (bounds.boxContainsSquareBD(expandedFloatingBox, shift.end)) return;

			const piece: ArrowPiece = {
				type: shift.type,
				coords: shift.end,
				index: -1,
				floating: true,
			}; // Create a piece object for the arrow

			// Add an arrow for every applicable direction
			for (const lineKey of gamefile.boardsim.pieces.lines.keys()) {
				let line = vectors.getVec2FromKey(lineKey);

				if (
					arrowscalculator.isAnimatedArrowUnnecessary(
						gamefile.boardsim,
						piece.type,
						line,
						lineKey,
						mode,
					)
				)
					continue; // Arrow mode isn't high enough, and the piece can't slide in the vector direction

				// Determine the line's dot product with the screen box.
				// Flip the vector if need be, to point it in the right direction.
				const thisPieceIntersections = geometry.findLineBoxIntersectionsBD(
					piece.coords,
					line,
					boundingBoxFloat,
				);
				if (thisPieceIntersections.length < 2) continue; // Slide direction doesn't intersect with screen box, no arrow needed

				const positiveDotProduct = thisPieceIntersections[0]!.positiveDotProduct; // We know the dot product of both intersections will be identical, because the piece is off-screen.
				// Negate the vector if it is pointing AWAY from the screen (negative dot product side),
				// so that `processPiece` always receives a vector pointing TOWARD the piece.
				if (!positiveDotProduct) line = vectors.negateVector(line);
				// At what point does it intersect the screen?
				const intersect = positiveDotProduct
					? thisPieceIntersections[0]!.coords
					: thisPieceIntersections[1]!.coords;

				// prettier-ignore
				const arrow: Arrow = arrowscalculator.processPiece(piece, line, intersect, 0, worldHalfWidth, pointerWorlds);
				animatedArrows.push(arrow);
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

	// Apply the board changes
	boardchanges.runChanges(gamefile, changes, boardchanges.changeFuncs, true);

	shifts.forEach((shift) => {
		if (shift.kind === 'delete' || shift.kind === 'move' || shift.kind === 'animate') {
			// Recalculate the lines through the start coordinate
			// prettier-ignore
			recalculateLinesThroughCoords(slideArrows, gamefile, shift.start, worldHalfWidth, pointerWorlds, slideExceptions);
		}
		if (shift.kind === 'add' || shift.kind === 'move') {
			// Recalculate the lines through the end coordinate
			// prettier-ignore
			recalculateLinesThroughCoords(slideArrows, gamefile, shift.end, worldHalfWidth, pointerWorlds, slideExceptions);
		}
	});

	// Restore the board state
	boardchanges.runChanges(gamefile, changes, boardchanges.changeFuncs, false);
}

/**
 * Recalculates all of the arrow lines the given piece
 * is on, adding them to this frame's list of arrows.
 */
function recalculateLinesThroughCoords(
	slideArrows: SlideArrows,
	gamefile: FullGame,
	coords: Coords,
	worldHalfWidth: number,
	pointerWorlds: DoubleCoords[],
	slideExceptions: Vec2Key[],
): void {
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

		const arrowsLineDraft = arrowscalculator.calcArrowsLineDraft(
			gamefile,
			slide,
			slideKey,
			organizedLine,
		);
		if (arrowsLineDraft === undefined) continue; // Only intersects the corner of our screen, not visible.

		// Remove Unnecessary arrows...
		if (!slideExceptions.includes(slideKey)) {
			arrowscalculator.removeTypesThatCantSlideOntoScreenFromLineDraft(arrowsLineDraft);
			if (arrowsLineDraft.negDotProd.length === 0 && arrowsLineDraft.posDotProd.length === 0)
				continue; // No more pieces on this line
		}

		slideArrows[slideKey] = slideArrows[slideKey] ?? {}; // Make sure this exists first.
		const { line } = arrowscalculator.convertLineDraftToLine(
			arrowsLineDraft,
			slide,
			slideKey,
			worldHalfWidth,
			pointerWorlds,
			false,
		);
		slideArrows[slideKey][lineKey] = line;
	}
}

// Exports -----------------------------------------------------------------------------

export default {
	resetShifts,
	deleteArrow,
	moveArrow,
	animateArrow,
	addArrow,
	executeArrowShifts,
};
