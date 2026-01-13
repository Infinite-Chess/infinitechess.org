// src/client/scripts/esm/game/main.ts

/*
 * This is the main script. This is where the game begins running.

 * This initiates the gl context, calls for the initiating of the shader programs, camera,
 * and input listeners, and begins the game loop.
 */

import webgl from './rendering/webgl.js';
import localstorage from '../util/localstorage.js';
import game from './chess/game.js';
import camera from './rendering/camera.js';
import websocket from './websocket.js';
import guiloading from './gui/guiloading.js';
import frametracker from './rendering/frametracker.js';
import frameratelimiter from './rendering/frameratelimiter.js';
import loadbalancer from './misc/loadbalancer.js';

// Starts the game. Runs automatically once the page is loaded.
function start(): void {
	guiloading.closeAnimation(); // Stops the loading screen animation
	webgl.init(); // Initiate the WebGL context. This is our web-based render engine.
	camera.init(); // Initiates the matrixes (uniforms) of our shader programs: viewMatrix (Camera), projMatrix (Projection), modelMatrix (world translation)

	game.init();

	initListeners();

	// Immediately asks the server if we are in a game.
	// If so, it will send the info to join it.
	websocket.sendmessage('game', 'joingame', undefined, true);

	// Update & draw the scene repeatedly
	frameratelimiter.requestFrame(gameLoop);
}

function initListeners(): void {
	window.addEventListener('beforeunload', (_event) => {
		// console.log('Detecting unload');

		// This allows us to control the reason why the socket was closed.
		// "1000 Closed by client" instead of "1001 Endpoint left"
		websocket.closeSocket();

		localstorage.eraseExpiredItems();
	});
}

/** The main game loop. Called every frame. */
function gameLoop(runtime: number): void {
	loadbalancer.update(runtime); // Updates fps, delta time, etc..

	game.update(); // Always update the game, even if we're afk. By FAR this is less resource intensive than rendering!

	render(); // Render everything

	// Reset all event listeners states so we can catch any new events that happen for the next frame.
	document.dispatchEvent(new Event('reset-listener-events'));

	// Loop again while app is running.
	frameratelimiter.requestFrame(gameLoop);
}

function render(): void {
	if (!frametracker.doWeRenderNextFrame()) return; // Only render the world though if any visual on the screen changed! This is to save cpu when there's no page interaction or we're afk.

	// console.log("Rendering this frame");

	webgl.clearScreen(); // Clear the color buffer and depth buffers
	game.render();

	frametracker.onFrameRender();
}

globalThis.main = { start };
