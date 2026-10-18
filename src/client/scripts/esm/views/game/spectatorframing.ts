// src/client/scripts/esm/views/game/spectatorframing.ts

/**
 * Keeps a spectator's camera on the game: while its toggle is on, the camera glides to frame the
 * position on the board, holds off while the viewer moves it, and switches off once they take it
 * far from the game, use a board control, or turn on perspective. Switched back on from far away,
 * it transitions back instead of gliding, which would take ever longer the further it had to go.
 */

import type { Framing, FramingConfig } from '../../board/rendering/boardframing.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import gameslot from '../../game/chess/gameslot.js';
import snapping from '../../game/rendering/highlights/snapping.js';
import gamescene from '../../game/rendering/gamescene.js';
import boarddrag from '../../game/rendering/boarddrag.js';
import Transition from '../../game/rendering/transitions/Transition.js';
import perspective from '../../game/rendering/perspective.js';
import { GameBus } from '../../board/GameBus.js';
import boardframing from '../../board/rendering/boardframing.js';
import boardgeometry from '../../board/rendering/boardgeometry.js';

// Types -----------------------------------------------------------------------

/** Whether the camera follows the game, is transitioning back to it to follow it, or is switched off. */
type Mode = 'following' | 'returning' | 'off';

// Elements --------------------------------------------------------------------

/** Rendered only for a spectator of a game still in progress when the page loaded. */
const element_Follow = document.getElementById('btn-follow') as HTMLButtonElement | null;

// Constants -------------------------------------------------------------------

/** How the camera frames the game. */
const FRAMING_CONFIG: FramingConfig = {
	maxZoomOut: 2.5,
	glideHalfLifeSecs: 0.1,
	snapEpsilon: 1e-3,
	entityWidthVPixels: snapping.ENTITY_WIDTH_VPIXELS,
};

/**
 * How far any edge of the view may lie from the target's while the viewer moves the camera,
 * before following switches off. Measured as {@link doesViewStray} does.
 */
const STRAY_TOLERANCE = bd.fromNumber(0.07);
/** How far the view may lie from the target, when switched on, to glide back rather than transition. */
const RETURN_TOLERANCE = bd.fromNumber(5);

// State -----------------------------------------------------------------------

let mode: Mode = 'following';
/** Where the camera is headed. Set as the game loads, before anything reads it. */
let framing: Framing;

// Events ----------------------------------------------------------------------

if (element_Follow)
	GameBus.addEventListener('graphical-loaded', () => start(element_Follow), { once: true });

// Lifecycle -------------------------------------------------------------------

/** Frames the game the moment it appears, then follows it. */
function start(toggle: HTMLButtonElement): void {
	reframe();
	boardframing.snap(gamescene.getGameContext(), framing);

	toggle.addEventListener('click', () => onToggle(toggle));
	GameBus.addEventListener('position-board', () => steer(toggle));
	GameBus.addEventListener('view-move', () => reframeIfOn());
	GameBus.addEventListener('canvas-resize', () => reframeIfOn()); // The fit depends on the canvas
	GameBus.addEventListener('board-nav', () => switchOff(toggle));
	GameBus.addEventListener('game-concluded', () => switchOff(toggle));
	GameBus.addEventListener('perspective-toggle', () => {
		if (perspective.getEnabled()) switchOff(toggle);
	});
}

/**
 * Stops following, or follows from the current view, recorded so undoing a transition returns to
 * it, transitioning back first if it's far from the game.
 */
function onToggle(toggle: HTMLButtonElement): void {
	if (mode !== 'off') return switchOff(toggle);
	// Anything still carrying the camera would count as the viewer moving it
	Transition.terminate();
	gamescene.getGameContext().boardpos.eraseMomentum();
	reframe();
	if (doesViewStray(RETURN_TOLERANCE)) {
		Transition.initTransitionFromArea(framing.target, false); // Records the view itself
		mode = 'returning';
	} else {
		Transition.recordView();
		mode = 'following';
	}
	renderToggle(toggle);
}

/** Stops following. */
function switchOff(toggle: HTMLButtonElement): void {
	mode = 'off';
	renderToggle(toggle);
}

/** Shows on the toggle whether following is on. */
function renderToggle(toggle: HTMLButtonElement): void {
	toggle.classList.toggle('enabled', mode !== 'off');
}

// Targeting -------------------------------------------------------------------

/** Frames the position now on the board, unless switched off. */
function reframeIfOn(): void {
	if (mode !== 'off') reframe();
}

/** Frames the position now on the board. */
function reframe(): void {
	framing = boardframing.create(
		gamescene.getGameContext(),
		gameslot.getGamefile()!,
		FRAMING_CONFIG,
	);
}

// Steering --------------------------------------------------------------------

/**
 * Eases the camera toward the game. While the viewer moves it instead, switches off the moment
 * they take it far from the game.
 */
function steer(toggle: HTMLButtonElement): void {
	if (mode === 'off') return;
	if (mode === 'returning') {
		if (Transition.areTransitioning()) return; // Our own, back to the game
		mode = 'following';
	}
	if (!isCameraMoving()) boardframing.glide(gamescene.getGameContext(), framing);
	else if (doesViewStray(STRAY_TOLERANCE)) switchOff(toggle);
}

/** Whether the board is being dragged, or still carried by pan or zoom momentum, or a transition. */
function isCameraMoving(): boolean {
	const { boardpos } = gamescene.getGameContext();
	return (
		boarddrag.isBoardDragging() ||
		Transition.areTransitioning() ||
		boardpos.boardHasMomentum() ||
		boardpos.getScaleVel() !== 0
	);
}

/**
 * Whether any edge of the view lies further from the target's than `tolerance` times the
 * width or height of the smaller of the two, so zooming in strays as much as zooming out.
 */
function doesViewStray(tolerance: BigDecimal): boolean {
	const { camera, boardpos } = gamescene.getGameContext();
	const view = boardgeometry.getBoundingBoxOfBoard(
		camera,
		boardpos.getBoardPos(),
		boardpos.getBoardScale(),
		false,
	);
	const target = framing.target.boundingBox;
	const width = bd.min(
		bd.subtract(view.right, view.left),
		bd.subtract(target.right, target.left),
	);
	const height = bd.min(
		bd.subtract(view.top, view.bottom),
		bd.subtract(target.top, target.bottom),
	);
	const toleranceX = bd.multiplyFloating(width, tolerance);
	const toleranceY = bd.multiplyFloating(height, tolerance);
	return (
		isEdgeBeyond(view.left, target.left, toleranceX) ||
		isEdgeBeyond(view.right, target.right, toleranceX) ||
		isEdgeBeyond(view.bottom, target.bottom, toleranceY) ||
		isEdgeBeyond(view.top, target.top, toleranceY)
	);
}

/** Whether an edge of the view lies further than `tolerance` from the target's matching edge. */
function isEdgeBeyond(edge: BigDecimal, targetEdge: BigDecimal, tolerance: BigDecimal): boolean {
	return bd.compare(bd.abs(bd.subtract(edge, targetEdge)), tolerance) > 0;
}
