// src/client/scripts/esm/views/game/game.ts

/**
 * Client entry for the game page (/game/:id).
 */

import webgl from '../../game/rendering/webgl.js';
import camera from '../../game/rendering/camera.js';
import gamecore from '../../game/chess/gamecore.js';
import socketman from '../../websocket/socketman.js';
import IndexedDB from '../../util/IndexedDB.js';
import socketsubs from '../../websocket/socketsubs.js';
import maskedDraw from '../../webgl/maskedDraw.js';
import gamesession from '../../game/chess/gamesession.js';
import LocalStorage from '../../util/LocalStorage.js';
import frametracker from '../../game/rendering/frametracker.js';
import loadbalancer from '../../game/misc/loadbalancer.js';
import socketmessages from '../../websocket/socketmessages.js';

import '../../game/gui/guisidebar.js';
import '../../game/misc/onlinegame/onlinegamerouter.js';

/** The game-page board canvas WebGL renders onto. */
const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;

/** Starts the game page. Runs once the page is loaded. */
function start(): void {
	const gl = webgl.init(canvas); // Initiate the WebGL context. This is our web-based render engine.
	camera.init(gl, canvas); // Initiates the camera/projection/model matrix uniforms.
	gamecore.init(canvas);

	initListeners();

	const { id, isLive } = window.gamePageData;
	if (isLive) {
		socketsubs.addSub('game'); // Make sure the send guard passes
		socketmessages.send('game', 'subscribe', id); // Server replies with the 'gamestate' full state.
	}
	// Dead (!isLive): out of scope here — wired in T10.

	// Update & draw the scene repeatedly
	requestAnimationFrame(gameLoop);
}

function initListeners(): void {
	window.addEventListener('beforeunload', () => {
		// Control the close reason ("1000 Closed by client" instead of "1001 Endpoint left").
		socketman.closeSocket();

		LocalStorage.eraseExpiredItems();
		IndexedDB.eraseExpiredItems();
	});
}

/** The main game loop. Called every frame. */
export function gameLoop(runtime: number): void {
	loadbalancer.update(runtime); // Updates fps, delta time, etc..

	gamecore.update(); // Always update the game, far cheaper than rendering.

	render();

	// Reset all event-listener states so we catch new events next frame.
	document.dispatchEvent(new Event('reset-listener-events'));

	requestAnimationFrame(gameLoop); // Loop again
}

function render(): void {
	if (!frametracker.doWeRenderNextFrame()) return; // Only render if something visual changed (saves cpu).
	// Don't render until the game is fully loaded.
	// Separately, the canvas remains visibility-hidden until fully loaded.
	if (gamesession.isLoading()) return;

	// console.log('Rendering frame');

	webgl.clearScreen(); // Clear the color + depth buffers
	maskedDraw.onFrameStart(); // Reset stencil bit-pair index for this frame

	gamecore.render();

	frametracker.onFrameRender();
}

start();
