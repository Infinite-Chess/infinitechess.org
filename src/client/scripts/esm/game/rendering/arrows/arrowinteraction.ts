// src/client/scripts/esm/game/rendering/arrows/arrowinteraction.ts

/**
 * The interactive game's layer over its board's arrow indicators: the user's arrow mode,
 * the hint arrows pointing to a selected piece's off-screen legal moves while in check,
 * and clicking any indicator to teleport toward what it points at.
 */

import type { Vec2 } from '../../../../../../shared/util/math/vectors.js';
import type { BDCoords, DoubleCoords } from '../../../../../../shared/util/coordutil.js';
import type { Mode, HintArrow, HoveredArrow } from '../../../board/rendering/arrows/arrows.js';

import bounds from '../../../../../../shared/util/math/bounds.js';
import vectors from '../../../../../../shared/util/math/vectors.js';
import geometry from '../../../../../../shared/util/math/geometry.js';
import bdcoords from '../../../../../../shared/util/bdcoords.js';
import coordutil from '../../../../../../shared/util/coordutil.js';

import space from '../../../board/rendering/space.js';
import mouse from '../../mouse.js';
import arrows from '../../../board/rendering/arrows/arrows.js';
import gameslot from '../../chess/gameslot.js';
import gamescene from '../gamescene.js';
import movehints from '../highlights/movehints.js';
import boardview from '../boardview.js';
import Transition from '../transitions/Transition.js';
import perspective from '../perspective.js';
import { GameBus } from '../../../board/GameBus.js';
import arrowshifts from '../../../board/rendering/arrows/arrowshifts.js';
import frametracker from '../../../board/rendering/frametracker.js';
import arrowscalculator from '../../../board/rendering/arrows/arrowscalculator.js';
import { listener_canvas } from '../../listeners.js';
import arrowlegalmovehighlights from './arrowlegalmovehighlights.js';
import { InputListener, Mouse, MouseButton } from '../../input.js';

// Constants -------------------------------------------------------------------

/** The distance in perspective mode to render the arrow indicators from the camera.
 * We need this because there is no normal edge of the screen like in 2D mode. */
const PERSPECTIVE_EDGE_DIST = 17;

// State -----------------------------------------------------------------------

/**
 * The mode the user last rotated to. Games that can't support
 * it lower the board's mode only, so a game that does gets it back.
 */
let preferredMode: Mode = 1;

/**
 * A list of all hint arrows computed for the current frame.
 * Each hints at an off-screen individual legal move destination.
 */
let hintArrows: HintArrow[] = [];

// Mode management -------------------------------------------------------------

/** Returns the mode the arrow indicators on the edges of the screen is currently in. */
function getMode(): Mode {
	return gamescene.getGameContext().arrows.mode;
}

/** Sets the current mode of the arrow indicators. */
function setMode(value: Mode): void {
	const state = gamescene.getGameContext().arrows;
	if (value === state.mode) return;

	state.mode = value;
	if (value === 0) {
		state.slideArrows = {};
		state.animatedArrows = [];
		state.hoveredArrows = [];
		hintArrows = [];
		arrowlegalmovehighlights.reset(); // Erase, otherwise their legal move highlights continue to render
	}
	GameBus.dispatch('arrow-mode-change');
}

/** Turns the arrows off for a game that can't render them, leaving the user's preference intact. */
function forceModeOff(): void {
	setMode(0);
}

/** Sets the mode to the user's preference, lowered to what the current game offers. */
function applyPreferredMode(): void {
	const cap = getModeCap();
	setMode(preferredMode > cap ? cap : preferredMode);
}

/** The highest mode the current game offers. Hippogonal arrows are only offered in variants using them. */
function getModeCap(): 2 | 3 {
	return gameslot.getGamefile()!.pieces.hippogonalsPresent ? 3 : 2;
}

/** Rotates the current mode of the arrow indicators. */
function toggleArrows(): void {
	frametracker.onVisualChange();
	const mode = getMode();
	// Have to do it weirdly like this, instead of using '++', because typescript complains that nextMode is of type number.
	let nextMode: Mode = mode === 0 ? 1 : mode === 1 ? 2 : mode === 2 ? 3 : /* mode === 3 ? */ 0;
	if (nextMode > getModeCap()) nextMode = 0; // Wrap back to zero
	preferredMode = nextMode; // Whatever they rotate to becomes their preference for future games.
	setMode(nextMode);
}

// Getters ---------------------------------------------------------------------

/**
 * Returns the list of arrow indicators hovered over this frame,
 * with references to the piece they are pointing to.
 */
function getHoveredArrows(): HoveredArrow[] {
	return gamescene.getGameContext().arrows.hoveredArrows;
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
	return getHoveredArrows().length > 0 || hintArrows.some((ha) => ha.hovered);
}

/**
 * Returns the world-space locations of all arrow indicators present for the current frame.
 * Must be called after update().
 */
function getAllArrowWorldLocations(): DoubleCoords[] {
	const board = gamescene.getGameContext();
	return [...arrows.getAllArrows(board), ...board.arrows.animatedArrows, ...hintArrows].map(
		(a) => a.worldLocation,
	);
}

// Frame lifecycle -------------------------------------------------------------

/** Calculates what arrows should be visible this frame, piece and hint arrows alike. */
function update(): void {
	const board = gamescene.getGameContext();
	const gamefile = gameslot.getGamefile()!;

	const boundingBoxFloat = perspective.getEnabled()
		? boardview.generatePerspectiveBoundingBox(PERSPECTIVE_EDGE_DIST)
		: boardview.gboundingBoxFloat();
	const pointerWorlds = mouse.getAllPointerWorlds();
	arrows.update(board, gamefile, boundingBoxFloat, pointerWorlds);

	hintArrows = arrowscalculator.areZoomedInEnoughForArrows(board) ? calcHintArrows(pointerWorlds) : []; // prettier-ignore
	// Arrow indicators are off, nothing is visible. Also reset this.
	if (!arrows.areArrowsActiveThisFrame(board)) arrowlegalmovehighlights.reset();
}

/**
 * Computes hint arrows for the current frame.
 * For each off-screen square returned by {@link movehints.getSquares},
 * creates a hint arrow at the nearest screen edge pointing toward that square.
 *
 * Respects the zoom threshold but ignores the current arrow mode,
 * so hint arrows are visible even when mode is 0 (off).
 */
function calcHintArrows(pointerWorlds: DoubleCoords[]): HintArrow[] {
	const hintSquares = movehints.getSquares();
	if (hintSquares.length === 0) return [];

	const board = gamescene.getGameContext();
	const { boundingBoxInt, boundingBoxFloat } = board.arrows;
	const pieceCoords = movehints.getPieceCoords()!;

	const worldHalfWidth = arrowscalculator.getArrowIndicatorHalfWidth(board);
	const newHintArrows: HintArrow[] = [];

	for (const hintSquare of hintSquares) {
		const hintSquareBD = bdcoords.fromCoords(hintSquare);

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
		if (intersections.length < 2) continue; // Arrow line does not intersect screen.
		const nearSide = intersections[0]!.positiveDotProduct
			? intersections[0]!.coords
			: intersections[1]!.coords;
		const worldLocation = space.convertCoordToWorldSpace_IgnoreSquareCenter(
			nearSide,
			board.boardpos.getBoardPos(),
			board.boardpos.getBoardScale(),
		);

		// If we've panned past the hint square, flip the triangle so it still points toward the square
		if (intersections[0]!.positiveDotProduct) direction = vectors.negateVector(direction);

		// Whether any pointer is within worldHalfWidth of the given world location.
		const hovered = pointerWorlds.some(
			(p) => vectors.chebyshevDistanceDoubles(worldLocation, p) < worldHalfWidth,
		);
		// Prevent dragging the board when clicking on the move hint arrow.
		if (hovered && mouse.isMouseDown(Mouse.LEFT)) mouse.claimMouseDown(Mouse.LEFT);

		newHintArrows.push({ worldLocation, direction, targetSquare: hintSquare, hovered });
	}

	return newHintArrows;
}

/**
 * Executes the arrow shifts queued this frame, then teleports toward
 * whatever arrow indicator was clicked, now that the frame's arrows are final.
 */
function executeArrowShifts(): void {
	const board = gamescene.getGameContext();
	arrowshifts.executeArrowShifts(board, gameslot.getGamefile()!, mouse.getAllPointerWorlds());
	transitionTowardClickedArrow();
}

// Teleporting -----------------------------------------------------------------

/** If an arrow indicator was clicked this frame, claims the click and pans toward what it points at. */
function transitionTowardClickedArrow(): void {
	let button: MouseButton;
	let listener: typeof mouse | InputListener;

	// Left mouse button
	if (mouse.isMouseClicked(Mouse.LEFT)) {
		button = Mouse.LEFT;
		listener = mouse;
	}
	// Finger simulating right mouse down (annotations mode ON)
	else if (
		listener_canvas.isMouseClicked(Mouse.RIGHT) &&
		listener_canvas.isMouseTouch(Mouse.RIGHT)
	) {
		button = Mouse.RIGHT;
		listener = listener_canvas;
	} else return; // No recognized click

	const clickWorld = mouse.getMouseWorld(button);
	if (!clickWorld) return; // Maybe we're looking into sky?

	const board = gamescene.getGameContext();
	const worldHalfWidth = arrowscalculator.getArrowIndicatorHalfWidth(board);
	const isClicked = (worldLocation: DoubleCoords): boolean =>
		vectors.chebyshevDistanceDoubles(worldLocation, clickWorld) < worldHalfWidth;

	let target: { coords: BDCoords; direction: Vec2 } | undefined;
	const hintArrow = hintArrows.find((ha) => isClicked(ha.worldLocation));
	if (hintArrow) {
		target = {
			coords: bdcoords.fromCoords(hintArrow.targetSquare),
			direction: hintArrow.direction,
		};
	} else {
		const pieceArrows = [...arrows.getAllArrows(board), ...board.arrows.animatedArrows];
		const pieceArrow = pieceArrows.find((a) => isClicked(a.worldLocation));
		if (pieceArrow)
			target = { coords: pieceArrow.piece.coords, direction: pieceArrow.direction };
	}
	if (!target) return;

	listener.claimMouseClick(button); // Don't let annotations erase/draw
	panAlongLineToward(target.coords, target.direction);
}

/**
 * Pans along a line to the perpendicular foot of the target coordinates, NOT straight to them.
 * @param direction - Either way along the line to pan along.
 */
function panAlongLineToward(targetCoords: BDCoords, direction: Vec2): void {
	const startCoords = gamescene.getGameContext().boardpos.getBoardPos();
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

// Exports ---------------------------------------------------------------------

export default {
	// Mode management
	getMode,
	forceModeOff,
	applyPreferredMode,
	toggleArrows,
	// Getters
	getHoveredArrows,
	getHintArrows,
	areHoveringAtleastOneArrow,
	getAllArrowWorldLocations,
	// Frame lifecycle
	update,
	executeArrowShifts,
};
