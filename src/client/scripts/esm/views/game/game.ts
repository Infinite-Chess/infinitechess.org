// src/client/scripts/esm/views/game/game.ts

/**
 * Client entry for the game page (/game/:id).
 */

import webgl from '../../game/rendering/webgl.js';
import camera from '../../game/rendering/camera.js';
import gamecore from '../../game/chess/gamecore.js';
import gameslot from '../../game/chess/gameslot.js';
import IndexedDB from '../../util/IndexedDB.js';
import maskedDraw from '../../webgl/maskedDraw.js';
import onlinegame from '../../game/misc/onlinegame/onlinegame.js';
import gamesession from '../../game/chess/gamesession.js';
import LocalStorage from '../../util/LocalStorage.js';
import frametracker from '../../game/rendering/frametracker.js';
import frameprofiler from '../../game/misc/frameprofiler.js';
import deadgameloader from '../../game/misc/onlinegame/deadgameloader.js';
import enginegameloader from './enginegameloader.js';

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

	if (window.gamePageData.engineGame) {
		// Live engine game: fetch its state over HTTP and run the engine locally — no socket opened.
		void enginegameloader.loadEngineGame();
	} else if (window.gamePageData.isLive) {
		onlinegame.subscribeToGame(); // Naturally requests the full game state which bootstraps the game
	} else {
		// Dead (memory-evicted) game: fetch its state over HTTP and render it — no socket opened.
		deadgameloader.loadDeadGame();
	}

	// Update & draw the scene repeatedly
	requestAnimationFrame(gameLoop);
}

function initListeners(): void {
	window.addEventListener('beforeunload', () => {
		LocalStorage.eraseExpiredItems();
		IndexedDB.eraseExpiredItems();
	});
}

/** The main game loop. Called every frame. */
export function gameLoop(runtime: number): void {
	frameprofiler.update(runtime); // Updates delta time & fps.

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
	if (!gameslot.getGamefile() || gamesession.isLoading()) return;

	// console.log('Rendering frame');

	webgl.clearScreen(); // Clear the color + depth buffers
	maskedDraw.onFrameStart(); // Reset stencil bit-pair index for this frame

	gamecore.render();

	frametracker.onFrameRender();
}

start();
