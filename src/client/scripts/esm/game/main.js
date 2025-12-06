/*
 * This is the main script. This is where the game begins running.

 * This initiates the gl context, calls for the initiating of the shader programs, camera,
 * and input listeners, and begins the game loop.
 */

// Import Start
import webgl from './rendering/webgl.js';
import loadbalancer from './misc/loadbalancer.js';
import localstorage from '../util/localstorage.js';
import game from './chess/game.js';
import camera from './rendering/camera.js';
import websocket from './websocket.js';
import guiloading from './gui/guiloading.js';
import frametracker from './rendering/frametracker.js';
import frameratelimiter from './rendering/frameratelimiter.js';
// Import End

('use strict');

// Starts the game. Runs automatically once the page is loaded.
function start() {
	guiloading.closeAnimation(); // Stops the loading screen animation
	webgl.init(); // Initiate the WebGL context. This is our web-based render engine.
	camera.init(); // Initiates the matrixes (uniforms) of our shader programs: viewMatrix (Camera), projMatrix (Projection), modelMatrix (world translation)

	game.init();

	initListeners();

	// Immediately asks the server if we are in a game.
	// If so, it will send the info to join it.
	websocket.sendmessage('game', 'joingame', undefined, true);

	gameLoop(); // Update & draw the scene repeatedly
}

function initListeners() {
	window.addEventListener('beforeunload', (_event) => {
		// console.log('Detecting unload');

		// This allows us to control the reason why the socket was closed.
		// "1000 Closed by client" instead of "1001 Endpoint left"
		websocket.closeSocket();

		localstorage.eraseExpiredItems();
	});
}

function gameLoop() {
	const loop = function (runtime) {
		loadbalancer.update(runtime); // Updates fps, delta time, etc..

		game.update(); // Always update the game, even if we're afk. By FAR this is less resource intensive than rendering!

		render(); // Render everything

		// Reset all event listeners states so we can catch any new events that happen for the next frame.
		document.dispatchEvent(new Event('reset-listener-events'));

		loadbalancer.timeAnimationFrame(); // This will time how long this frame took to animate

		// Loop again while app is running.
		frameratelimiter.requestFrame(loop);
	};

	frameratelimiter.requestFrame(loop); // Calls the very first frame. Subsequent loops are called in the loop() function
}

function render() {
	if (!frametracker.doWeRenderNextFrame()) return; // Only render the world though if any visual on the screen changed! This is to save cpu when there's no page interaction or we're afk.

	// console.log("Rendering this frame");

	webgl.clearScreen(); // Clear the color buffer and depth buffers
	game.render();

	frametracker.onFrameRender();
}

globalThis.main = { start };
