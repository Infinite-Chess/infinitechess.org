
/*
 * This is the main script. This is where the game begins running.

 * This initiates the gl context, calls for the initiating of the shader programs, camera,
 * and input listeners, and begins the game loop.
 */

// Import Start
import webgl from './rendering/webgl.js';
import loadbalancer from './misc/loadbalancer.js';
import input from './input.js';
import onlinegame from './misc/onlinegame.js';
import localstorage from '../util/localstorage.js';
import game from './chess/game.js';
import shaders from './rendering/shaders.js';
import browsersupport from './misc/browsersupport.js';
import camera from './rendering/camera.js';
import invites from './misc/invites.js';
import websocket from './websocket.js';
import guiloading from './gui/guiloading.js';
// The ONLY reason we import tooltips is so that it can be tied into the
// dependancy tree of our game, otherwise it won't be included, since NOTHING depends on it,
// yet it needs to be an ESM because IT depends on input.js!
// eslint-disable-next-line no-unused-vars
import tooltips from './gui/tooltips.js';
import frametracker from './rendering/frametracker.js';
// Import End

"use strict";



// Starts the game. Runs automatically once the page is loaded. 
function start() {
	guiloading.closeAnimation(); // Stops the loading screen animation
	webgl.init(); // Initiate the WebGL context. This is our web-based render engine.
	shaders.initPrograms(); // Initiates the few shader programs we will be using. The most common we'll be using is the textureProgram, but we also create a shader program for color, and another for tinted textures.
	camera.init(); // Initiates the matrixes (uniforms) of our shader programs: viewMatrix (Camera), projMatrix (Projection), worldMatrix (world translation)

	browsersupport.checkBrowserSupport();

	game.init(); // Initiates textures, buffer models for rendering, and the title screen.

	initListeners();

	onlinegame.askServerIfWeAreInGame();

	localstorage.eraseExpiredItems();

	gameLoop(); // Update & draw the scene repeatedly
}

function initListeners() {
	input.initListeners(); // Mouse, touch, & key event listeners

	window.addEventListener('beforeunload', function() {
		// console.log('Detecting unload')

		// This allows us to control the reason why the socket was closed.
		// "1000 Closed by client" instead of "1001 Endpoint left"
		websocket.closeSocket();
        
		invites.deleteInviteTagInLocalStorage();
		localstorage.eraseExpiredItems();
	});
}

function gameLoop() {

	const loop = function(runtime) {
		loadbalancer.update(runtime); // Updates fps, delta time, etc..

		game.update(); // Always update the game, even if we're afk. By FAR this is less resource intensive than rendering!

		render(); // Render everything
        
		input.update(); // Key events should be reset as soon as possible after updating, so we don't miss any. Then again, all events are fired at the end of the animation frame anyway.

		loadbalancer.timeAnimationFrame(); // This will time how long this frame took to animate

		// Loop again while app is running. This automatically won't be called more times than your screen can refresh per second.
		requestAnimationFrame(loop);
	};

	requestAnimationFrame(loop); // Calls the very first frame. Subsequent loops are called in the loop() function
}

function render() {
	if (!frametracker.doWeRenderNextFrame()) return; // Only render the world though if any visual on the screen changed! This is to save cpu when there's no page interaction or we're afk.

	// console.log("Rendering this frame")

	webgl.clearScreen(); // Clear the color buffer and depth buffers
	game.render();

	frametracker.onFrameRender();
}

globalThis.main = { start };