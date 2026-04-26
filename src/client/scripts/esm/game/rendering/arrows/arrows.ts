// src/client/scripts/esm/game/rendering/arrows/arrows.ts

/**
 * This script manages the state of arrow indicators on the sides of the screen,
 * pointing to pieces off-screen that are in that direction.
 *
 * If the pictures are clicked, we initiate a teleport to that piece.
 *
 * Other scripts may add/remove arrows in between update() and render() calls.
 * Calculation is handled by arrowscalculator, shifting by arrowshifts,
 * and rendering by arrowsgraphics.
 */

import type { Vec2, Vec2Key } from '../../../../../../shared/util/math/vectors.js';
import type {
	BDCoords,
	Coords,
	DoubleCoords,
} from '../../../../../../shared/chess/util/coordutil.js';

import gameslot from '../../chess/gameslot.js';
import arrowshifts from './arrowshifts.js';
import frametracker from '../frametracker.js';
import arrowscalculator from './arrowscalculator.js';
import arrowlegalmovehighlights from './arrowlegalmovehighlights.js';

// Types -------------------------------------------------------------------------------

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

// Constants ---------------------------------------------------------------------------

/** The maximum number of pieces in a game before we disable arrow indicator rendering, for performance. */
const MAX_PIECES = 40_000;
/** The maximum number of lines in a game before we disable arrow indicator rendering, for performance. */
const MAX_LINES = 8;

// State -------------------------------------------------------------------------------

/**
 * The mode the arrow indicators on the edges of the screen is currently in.
 * 0 = Off,
 * 1 = Defense,
 * 2 = All (orthogonals & diagonals)
 * 3 = All (including hippogonals, only used in variants using hippogonals)
 */
let mode: 0 | 1 | 2 | 3 = 1;

/**
 * A list of all arrows present for the current frame.
 *
 * Other scripts are given an opportunity to add/remove
 * arrows from this list before rendering, but they must
 * do so between the update() and render() calls.
 */
let slideArrows: SlideArrows = {};

/**
 * A list of all piece-arrows being hovered over this frame (excludes move hints),
 * with a reference to the piece they are pointing to.
 * Other scripts may access this so they can add interaction with them.
 */
let hoveredArrows: HoveredArrow[] = [];

/**
 * A list of all animated arrows IN MOTION for the current frame.
 *
 * This does not include still ones, for example rendered from
 * the piece captured being rendered in place.
 * Still animation's lines are recalculated manually.
 */
let animatedArrows: Arrow[] = [];

/**
 * A list of all hint arrows computed for the current frame.
 * Each hints at an off-screen individual legal move destination.
 */
let hintArrows: HintArrow[] = [];

// Mode management ---------------------------------------------------------------------

/** Returns the mode the arrow indicators on the edges of the screen is currently in. */
function getMode(): typeof mode {
	return mode;
}

/** Sets the current mode of the arrow indicators. */
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

// Getters -----------------------------------------------------------------------------

/**
 * Returns all Arrow objects currently in the slide arrows structure.
 * Does NOT include animated arrows.
 * Callers may mutate arrow properties (e.g. opacity) before rendering.
 */
function getAllArrows(): Arrow[] {
	const result: Arrow[] = [];
	for (const linesOfDirection of Object.values(slideArrows)) {
		for (const line of Object.values(linesOfDirection as { [lineKey: string]: ArrowsLine })) {
			for (const arrow of line.posDotProd) result.push(arrow);
			for (const arrow of line.negDotProd) result.push(arrow);
		}
	}
	return result;
}

/** Returns the current slide arrows state for this frame. */
function getSlideArrows(): SlideArrows {
	return slideArrows;
}

/** Returns the current animated arrows for this frame. */
function getAnimatedArrows(): Arrow[] {
	return animatedArrows;
}

/**
 * Returns the list of arrow indicators hovered over this frame,
 * with references to the piece they are pointing to.
 */
function getHoveredArrows(): HoveredArrow[] {
	return hoveredArrows;
}

/** Returns the current hint arrows for this frame. */
function getHintArrows(): HintArrow[] {
	return hintArrows;
}

/**
 * Whether the mouse is currently hovering over at least one
 * arrow indicator of any type (piece or move hint) on the screen.
 */
function areHoveringAtleastOneArrow(): boolean {
	return hoveredArrows.length > 0 || hintArrows.some((ha) => ha.hovered);
}

/**
 * Returns the world-space locations of all arrow indicators present for the current frame.
 * Must be called after update().
 */
function getAllArrowWorldLocations(): DoubleCoords[] {
	return [...getAllArrows(), ...animatedArrows].map((a) => a.worldLocation);
}

/**
 * Whether the piece arrows should be calculated and rendered this frame.
 * Excludes move hint arrows--those are always active so long as we're zoomed in enough.
 */
function areArrowsActiveThisFrame(): boolean {
	// false if the arrows are off, or if the board is too zoomed out
	return mode !== 0 && arrowscalculator.areZoomedInEnoughForArrows();
}

// Frame lifecycle ---------------------------------------------------------------------

/**
 * Resets the arrows lists in prep for the next frame.
 */
function reset(): void {
	slideArrows = {};
	animatedArrows = [];
	hoveredArrows = [];
	hintArrows = [];
	arrowshifts.reset();
}

/**
 * Calculates what arrows should be visible this frame.
 *
 * Needs to be done every frame, even if the mouse isn't moved,
 * since actions such as rewinding/forwarding may change them,
 * or board velocity.
 */
function update(): void {
	reset();

	const result = arrowscalculator.calculateArrows(mode); // { active, slideArrows, hoveredArrows, hintArrows }

	if (result.hintArrows) hintArrows = result.hintArrows;

	if (!result.active) {
		// Arrow indicators are off, nothing is visible.
		arrowlegalmovehighlights.reset(); // Also reset this
		return;
	}

	hoveredArrows = result.hoveredArrows!;
	slideArrows = result.slideArrows!;
}

// Exports -----------------------------------------------------------------------------

export default {
	// Constants
	MAX_PIECES,
	MAX_LINES,
	// Mode management
	getMode,
	setMode,
	toggleArrows,
	// Getters
	getAllArrows,
	getSlideArrows,
	getAnimatedArrows,
	getHoveredArrows,
	getHintArrows,
	areHoveringAtleastOneArrow,
	getAllArrowWorldLocations,
	areArrowsActiveThisFrame,
	// Frame lifecycle
	update,
};
