// src/client/scripts/esm/board/rendering/arrows/arrows.ts

/**
 * This script manages the state of a board's arrow indicators on the sides of the screen,
 * pointing to pieces off-screen that are in that direction.
 *
 * Other scripts may add/remove arrows in between update() and render() calls.
 * Calculation is handled by arrowscalculator, shifting by arrowshifts,
 * and rendering by arrowsgraphics. Clicking them is game-only, in arrowinteraction.
 */

import type LiveBoard from '../LiveBoard.js';
import type { Shift } from './arrowshifts.js';
import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { Vec2, Vec2Key } from '../../../../../../shared/util/math/vectors.js';
import type { BoundingBox, BoundingBoxBD } from '../../../../../../shared/util/math/bounds.js';
import type { BDCoords, Coords, DoubleCoords } from '../../../../../../shared/util/coordutil.js';

import arrowscalculator from './arrowscalculator.js';

// Types -----------------------------------------------------------------------

/**
 * A mode of the arrow indicators.
 * 0 = Off,
 * 1 = Defense,
 * 2 = All (orthogonals & diagonals)
 * 3 = All (including hippogonals, only used in variants using hippogonals)
 */
export type Mode = 0 | 1 | 2 | 3;

/** One board's arrow indicators: their mode, and this frame's arrows. */
export interface ArrowsState {
	/** The mode the arrow indicators are in. */
	mode: Mode;
	/**
	 * All arrows present for the current frame.
	 *
	 * Other scripts are given an opportunity to add/remove
	 * arrows from this list before rendering, but they must
	 * do so between the update() and render() calls.
	 */
	slideArrows: SlideArrows;
	/**
	 * All piece-arrows being hovered over this frame,
	 * with a reference to the piece they are pointing to.
	 */
	hoveredArrows: HoveredArrow[];
	/**
	 * All animated arrows IN MOTION for the current frame.
	 *
	 * This does not include still ones, for example rendered from
	 * the piece captured being rendered in place.
	 * Still animation's lines are recalculated manually.
	 */
	animatedArrows: Arrow[];
	/**
	 * The bounding box of the screen for this frame, with padding added so
	 * that arrow indicators aren't touching the very edge of the screen.
	 */
	boundingBoxFloat?: BoundingBoxBD;
	/**
	 * The bounding box of the screen for this frame,
	 * rounded outward to contain the entirety of
	 * any square even partially visible.
	 */
	boundingBoxInt?: BoundingBox;
	/** Arrow modifications made by other scripts after update() and before render(). */
	shifts: Shift[];
}

/** An object containing all the arrow lines of a single frame. */
export interface SlideArrows {
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
 * that is CLOSEST to you (screen center) on the line!
 */
export interface ArrowsLine {
	/** Pieces on this line that intersect the screen with a positive dot product.
	 * SORTED in order of closest to the screen to farthest. */
	posDotProd: Arrow[];
	/** Pieces on this line that intersect the screen with a negative dot product.
	 * SORTED in order of closest to the screen to farthest.
	 * The arrow direction for these will be flipped to the other side. */
	negDotProd: Arrow[];
}

/** A single piece-based arrow indicator, with enough information to be able to render it. */
export interface Arrow extends BaseArrow {
	piece: ArrowPiece;
	/** Opacity to render this arrow at when not hovered. Defaults to the module-level opacity constant. */
	opacity: number;
	/**
	 * The direction the arrow triangle points.
	 * Equals `negateVector(processPiece vector)`, used directly as the render angle.
	 */
	direction: Vec2;
	/**
	 * Index within the adjacent-picture stack on this line. 0 for the primary (outermost)
	 * indicator; > 0 for stacked indicators closer to the screen center.
	 */
	stackIndex: number;
}

/**
 * Reflection of the {@link Piece} type, but with extra decimal precision
 * for the coordinates (needed for animated arrows).
 */
export interface ArrowPiece {
	type: number;
	coords: BDCoords;
	index: number;
	/** Whether the piece is at a floating point coordinate. */
	floating: boolean;
}

/** Shared base for all screen-edge arrow indicators. */
interface BaseArrow {
	/** The world-space position of this indicator on the screen edge. */
	worldLocation: DoubleCoords;
	/** Whether this indicator is being hovered over by the mouse. */
	hovered: boolean;
}

/** Hovered-arrow event: identifies which arrow indicator is currently being hovered. */
export interface HoveredArrow {
	/** A reference to the piece it is pointing to */
	piece: ArrowPiece;
	/**
	 * The direction this arrow points (from the screen edge toward the piece).
	 * Matches the slide direction the arrow indicator represents.
	 */
	direction: Vec2;
	/** The world-space position of this arrow indicator on the screen edge. */
	worldLocation: DoubleCoords;
	/**
	 * Whether the piece can generally slide in the arrow direction.
	 * IS NOT calculated for shifted arrows (always true).
	 */
	ownsSlide: boolean;
}

/** An arrow indicator for an off-screen individual legal move, shown when in check. */
export interface HintArrow extends BaseArrow {
	/** Direction this indicator points, from the screen edge toward its target. */
	direction: Vec2;
	/** The target square this hint arrow points to. */
	targetSquare: Coords;
}

// Constants -------------------------------------------------------------------

/** The maximum number of pieces in a game before we disable arrow indicator rendering, for performance. */
const MAX_PIECES = 40_000;
/** The maximum number of lines in a game before we disable arrow indicator rendering, for performance. */
const MAX_LINES = 8;

/** The mode every board's arrow indicators start in. */
const DEFAULT_MODE: Mode = 1;

// Factory ---------------------------------------------------------------------

/** Creates a board's arrow indicator state, empty until its first update. */
function createState(): ArrowsState {
	return {
		mode: DEFAULT_MODE,
		slideArrows: {},
		hoveredArrows: [],
		animatedArrows: [],
		shifts: [],
	};
}

// Getters ---------------------------------------------------------------------

/**
 * Returns all Arrow objects currently in the slide arrows structure.
 * Does NOT include animated arrows.
 * Callers may mutate arrow properties (e.g. opacity) before rendering.
 */
function getAllArrows(board: LiveBoard): Arrow[] {
	const result: Arrow[] = [];
	for (const linesOfDirection of Object.values(board.arrows.slideArrows)) {
		for (const line of Object.values(linesOfDirection as { [lineKey: string]: ArrowsLine })) {
			for (const arrow of line.posDotProd) result.push(arrow);
			for (const arrow of line.negDotProd) result.push(arrow);
		}
	}
	return result;
}

/**
 * Whether the piece arrows should be calculated and rendered this frame.
 * Excludes move hint arrows--those are always active so long as we're zoomed in enough.
 */
function areArrowsActiveThisFrame(board: LiveBoard): boolean {
	// false if the arrows are off, or if the board is too zoomed out
	return board.arrows.mode !== 0 && arrowscalculator.areZoomedInEnoughForArrows(board);
}

// Frame lifecycle -------------------------------------------------------------

/**
 * Calculates what arrows should be visible this frame.
 *
 * Needs to be done every frame, even if the mouse isn't moved,
 * since actions such as rewinding/forwarding may change them,
 * or board velocity.
 * @param boundingBoxFloat - The exact bounding box of the board visible on screen.
 * @param pointerWorlds - The world coordinates every existing pointer is over, for hovering.
 */
function update(
	board: LiveBoard,
	boardsim: GameFile,
	boundingBoxFloat: BoundingBoxBD,
	pointerWorlds: DoubleCoords[],
): void {
	const state = board.arrows;
	state.slideArrows = {};
	state.animatedArrows = [];
	state.hoveredArrows = [];
	state.shifts.length = 0;

	arrowscalculator.updateBoundingBoxes(board, boundingBoxFloat);
	if (!areArrowsActiveThisFrame(board)) return; // Arrow indicators are off, nothing is visible.

	const result = arrowscalculator.calculateArrows(board, boardsim, pointerWorlds);
	state.slideArrows = result.slideArrows;
	state.hoveredArrows = result.hoveredArrows;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	MAX_PIECES,
	MAX_LINES,
	// Factory
	createState,
	// Getters
	getAllArrows,
	areArrowsActiveThisFrame,
	// Frame lifecycle
	update,
};
