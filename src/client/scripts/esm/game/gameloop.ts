// src/client/scripts/esm/game/gameloop.ts

/**
 * The frame, for pages with an interactive board (game, analysis, editor...): the WebGL
 * bootstrap, the animation-frame driver, the ordered per-frame update of every game module,
 * and the render gate that skips drawing when nothing changed.
 *
 * A page calls {@link init} once to boot the render engine, wires up its own page-specific
 * setup, then calls {@link start}.
 */

import type { Mesh } from '../board/rendering/piecemodels.js';
import type { GameFile } from '../../../../shared/chess/logic/gamefile.js';

import clock from '../../../../shared/chess/logic/clock.js';

import mouse from './mouse.js';
import webgl from '../board/rendering/webgl.js';
import arrows from './rendering/arrows/arrows.js';
import camera from '../board/rendering/camera.js';
import toggles from './debug/toggles.js';
import boardnav from './boardnav.js';
import boardpos from '../board/rendering/boardpos.js';
import gameslot from './chess/gameslot.js';
import snapping from './rendering/highlights/snapping.js';
import guiclock from './gui/guiclock.js';
import premoves from './chess/premoves.js';
import keybinds from './keybinds.js';
import listeners from './listeners.js';
import animation from './rendering/animation.js';
import selection from './chess/selection.js';
import boarddrag from './rendering/boarddrag.js';
import IndexedDB from '../util/IndexedDB.js';
import starfield from './rendering/starfield.js';
import gamesound from '../board/gamesound.js';
import gamescene from './rendering/gamescene.js';
import droparrows from './rendering/dragging/droparrows.js';
import dragarrows from './rendering/dragging/dragarrows.js';
import maskeddraw from '../webgl/maskeddraw.js';
import Transition from './rendering/transitions/Transition.js';
import gamesession from './chess/gamesession.js';
import arrowshifts from './rendering/arrows/arrowshifts.js';
import annotations from './rendering/highlights/annotations/annotations.js';
import LocalStorage from '../util/LocalStorage.js';
import guimoveslist from './gui/guimoveslist.js';
import frametracker from '../board/rendering/frametracker.js';
import draganimation from './rendering/dragging/draganimation.js';
import frameprofiler from '../board/frameprofiler.js';
import boardgeometry from '../board/rendering/boardgeometry.js';
import guiboardcontrols from './gui/guiboardcontrols.js';
import arrowlegalmovehighlights from './rendering/arrows/arrowlegalmovehighlights.js';

// State ---------------------------------------------------------------------------------

/** Optional per-frame page logic, run each frame after the game modules update. */
let onUpdate: (() => void) | undefined;

// Setup ---------------------------------------------------------------------------------

/** Boots the WebGL render engine and shared page-teardown listeners. Call once before {@link start}. */
function init(canvas: HTMLCanvasElement): void {
	const gl = webgl.init(canvas); // Initiate the WebGL context. This is our web-based render engine.
	camera.init(gl, canvas); // Initiates the camera/projection/model matrix uniforms.
	camera.wireGlobalListeners(); // Keep the interactive camera synced to window resizes, FOV changes & game unloads.
	boardpos.wireGlobalListeners(); // Erase board momentum when the game starts a transition.
	gamescene.init(canvas);
	listeners.init(canvas);
	preloadSounds();

	// Repaint synchronously the instant the canvas buffer resizes. Assigning canvas.width/height
	// wipes the drawing buffer to black; drawing now before the browser composites means that
	// black is never shown for a single frame.
	document.addEventListener('canvas_resize', () => {
		// A resize changes the board's on-screen bounding box, so recalculate the geometry
		// before repainting — otherwise we'd draw with the stale box, or an undefined one on
		// the first frame, since the normal loop only recalculates it inside update().
		boardgeometry.recalcVariables();
		render();
	});

	window.addEventListener('beforeunload', () => {
		LocalStorage.eraseExpiredItems();
		IndexedDB.eraseExpiredItems();
	});
}

/** Preloads all game sounds so they are ready to play without delay. */
function preloadSounds(): void {
	gamesound.preload('move');
	gamesound.preload('capture');
	gamesound.preload('bell');
	gamesound.preload('ripple_a3');
	gamesound.preload('base_staccato_c2');
	gamesound.preload('notify');
	gamesound.preload('low_time');
}

// The Loop ------------------------------------------------------------------------------

/**
 * Begins the update+render loop, running every animation frame.
 * @param pageUpdate - Optional per-frame page logic (e.g. keyboard shortcuts), run after the game modules update.
 */
function start(pageUpdate?: () => void): void {
	onUpdate = pageUpdate;
	requestAnimationFrame(gameLoop);
}

/** The main loop. Called every animation frame. */
function gameLoop(runtime: number): void {
	frameprofiler.update(runtime); // Updates delta time & fps.

	update(); // Always update the game, far cheaper than rendering.
	onUpdate?.();

	render();

	// Reset all event-listener states so we catch new events next frame.
	document.dispatchEvent(new Event('reset-listener-events'));

	requestAnimationFrame(gameLoop); // Loop again
}

// Update the game every single frame
function update(): void {
	camera.shake.update();
	toggles.testOutGame();
	const gamefile = gameslot.getGamefile();
	if (!gamefile || gamesession.isLoading()) return; // If the game isn't totally finished loading, nothing is visible, only the background.

	// Any input should trigger the next frame to render.
	if (listeners.atleastOneInput()) frametracker.onVisualChange();

	const mesh = gameslot.getMesh()!;

	toggles.testInGame(gamefile, mesh);
	guimoveslist.update();

	clock.update(gamefile);
	guiclock.update(gamefile);

	boardnav.update(); // Update board dragging, and WASD to move, scroll to zoom
	if (!Transition.areTransitioning()) boardpos.update(); // Updates the board's position and scale according to its velocity

	boarddrag.dragBoard(); // Calculate new board position if it's being dragged. After boardnav.update(), boardpos.update()
	// BEFORE board.recalcVariables(), as that needs to be called after the board position is updated.
	Transition.update();
	// AFTER boarddrag.dragBoard() or picking up the board has a spring back effect to it
	// AFTER transition.update() since that updates the board position
	boardgeometry.recalcVariables();

	starfield.update();
	// Update the effect zone manager (after board variables are recalculated).
	gamescene.updateEffectZone();

	// Check if the board needs to be pinched (will not single-pointer grab)
	// This needs to be early in the update loop, as pinching the board has priority over the pointer than a lot of things.
	boarddrag.checkIfBoardPinched();

	// NEEDS TO BE BEFORE arrows.update(), since this may forward to front, which changes all arrows visible.
	selection.update();
	arrows.update();
	// NEEDS TO BE AFTER arrows.update() because this modifies the arrow indicator list.
	// NEEDS TO BE BEFORE boarddrag.checkIfBoardSingleGrabbed() because that shift arrows needs to overwrite this.
	animation.update();
	draganimation.updateDragLocation(); // BEFORE droparrows.shiftArrows() so that can overwrite this.
	droparrows.shiftArrows(); // Shift the arrows of the dragged piece AFTER selection.update() makes any moves made!
	dragarrows.update(); // AFTER droparrows.shiftArrows(), BEFORE executeArrowShifts().
	arrowshifts.executeArrowShifts(); // Execute any arrow modifications made by animation.js or arrowsdrop.js. BEFORE arrowlegalmovehighlights.update()
	droparrows.updateLegalCaptureArrows(); // AFTER executeArrowShifts(), so rebuilt arrow lines don't reset pulsating opacities.

	arrowlegalmovehighlights.update(); // AFTER executeArrowShifts()

	// NEEDS TO BE BEFORE annotations.update() since adding new highlights snaps to what mini image is being hovered over.
	// BEFORE checkIfBoardSingleGrabbed(), because clicks should prioritize teleporting to miniimages over dragging the board!
	snapping.transitionToHoveredIfClicked();
	premoves.update(gamefile, mesh); // BEFORE annotations.update(), since if right click cancels premoves, we don't want to draw arrows.
	// AFTER snapping updates entities hovered, since adding/removing depends on current hovered entities.
	annotations.update();

	// AFTER snapping updates, since clicking on a highlight line should claim the click that would other wise collapse all annotations.
	testIfEmptyBoardRegionClicked(gamefile, mesh); // If we clicked an empty region of the board, collapse annotations and cancel premoves.
	// Now we can check if the board needs to be single-pointer grabbed, as other scripts may have claimed the pointer first.
	// AFTER: selection.update(), animation.update() because shift arrows needs to overwrite that.
	// After snapping updates entities hovered, because clicks prioritize those.
	boarddrag.checkIfBoardSingleGrabbed();

	guiboardcontrols.updateCoords(); // Update the coordinates on the side bar

	// preferences.update(); // ONLY USED for temporarily micro adjusting theme properties & colors
}

/**
 * Tests if by clicking an empty region of the board,
 * we need to clear premoves and collapse annotations.
 */
function testIfEmptyBoardRegionClicked(gamefile: GameFile, mesh: Mesh | undefined): void {
	const mouseKeybind = keybinds.getCollapseMouseButton();
	if (mouseKeybind === undefined) return; // No button is assigned to collaping annotes / cancelling premoves currently

	if (mouse.isMouseClicked(mouseKeybind)) {
		mouse.claimMouseClick(mouseKeybind);

		premoves.cancelPremoves(gamefile, mesh);
		annotations.Collapse();
	}
}

/** Renders the scene, but only when something visual changed (saves CPU). */
function render(): void {
	if (!frametracker.doWeRenderNextFrame()) return;
	// Don't render until the game is fully loaded
	// (the canvas stays visibility-hidden until then).
	if (!gameslot.getGamefile() || gamesession.isLoading()) return;

	gamescene.getGameContext().clearScreen(); // Clear the color + depth + stencil buffers
	maskeddraw.onFrameStart(); // Reset stencil bit-pair index for this frame

	gamescene.render();

	frametracker.onFrameRender();
}

// Exports -------------------------------------------------------------------------------

export default { init, start };
