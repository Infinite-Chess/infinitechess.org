// src/client/scripts/esm/game/gameloop.ts

/**
 * The shared WebGL bootstrap and render loop for pages with an ineractive
 * board (game, analysis...).
 *
 * A page calls {@link init} once to boot the render engine, wires up its own
 * page-specific setup, then calls {@link start} to run the update+render loop.
 */

import webgl from './rendering/webgl.js';
import camera from './rendering/camera.js';
import boardpos from './rendering/boardpos.js';
import gamecore from './chess/gamecore.js';
import gameslot from './chess/gameslot.js';
import IndexedDB from '../util/IndexedDB.js';
import maskedDraw from '../webgl/maskedDraw.js';
import gamesession from './chess/gamesession.js';
import LocalStorage from '../util/LocalStorage.js';
import frametracker from './rendering/frametracker.js';
import boardgeometry from './rendering/boardgeometry.js';
import frameprofiler from './misc/frameprofiler.js';

/** Optional per-frame page logic, run each frame after the game core updates. */
let onUpdate: (() => void) | undefined;

/** Boots the WebGL render engine and shared page-teardown listeners. Call once before {@link start}. */
function init(canvas: HTMLCanvasElement): void {
	const gl = webgl.init(canvas); // Initiate the WebGL context. This is our web-based render engine.
	camera.init(gl, canvas); // Initiates the camera/projection/model matrix uniforms.
	camera.wireGlobalListeners(); // Keep the interactive camera synced to window resizes & FOV changes.
	boardpos.wireGlobalListeners(); // Erase board momentum when the game starts a transition.
	gamecore.init(canvas);

	// Repaint synchronously the instant the canvas buffer resizes. Assigning canvas.width/height
	// wipes the drawing buffer to black; drawing now before the browser composites means that
	// black is never shown for a single frame.
	document.addEventListener('canvas_resize', () => {
		// A resize changes the board's on-screen bounding box, so recalculate the geometry
		// before repainting — otherwise we'd draw with the stale box, or an undefined one on
		// the first frame, since the normal loop only recalculates it inside gamecore.update().
		boardgeometry.recalcVariables();
		render();
	});

	window.addEventListener('beforeunload', () => {
		LocalStorage.eraseExpiredItems();
		IndexedDB.eraseExpiredItems();
	});
}

/**
 * Begins the update+render loop, running every animation frame.
 * @param pageUpdate - Optional per-frame page logic (e.g. keyboard shortcuts), run after the game core updates.
 */
function start(pageUpdate?: () => void): void {
	onUpdate = pageUpdate;
	requestAnimationFrame(gameLoop);
}

/** The main loop. Called every animation frame. */
function gameLoop(runtime: number): void {
	frameprofiler.update(runtime); // Updates delta time & fps.

	gamecore.update(); // Always update the game, far cheaper than rendering.
	onUpdate?.();

	render();

	// Reset all event-listener states so we catch new events next frame.
	document.dispatchEvent(new Event('reset-listener-events'));

	requestAnimationFrame(gameLoop); // Loop again
}

/** Renders the scene, but only when something visual changed (saves CPU). */
function render(): void {
	if (!frametracker.doWeRenderNextFrame()) return;
	// Don't render until the game is fully loaded
	// (the canvas stays visibility-hidden until then).
	if (!gameslot.getGamefile() || gamesession.isLoading()) return;

	gamecore.getGameContext().clearScreen(); // Clear the color + depth + stencil buffers
	maskedDraw.onFrameStart(); // Reset stencil bit-pair index for this frame

	gamecore.render();

	frametracker.onFrameRender();
}

export default { init, start };
