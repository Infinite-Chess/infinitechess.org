// src/client/scripts/esm/views/index.ts

import bigdecimal from '@naviary/bigdecimal';

import camera from '../game/rendering/camera.js';
import boardpos from '../game/rendering/boardpos.js';
import deltatime from '../game/misc/deltatime.js';
import boardtiles from '../game/rendering/boardtiles.js';
import Renderable from '../webgl/Renderable.js';
import perspective from '../game/rendering/perspective.js';
import frametracker from '../game/rendering/frametracker.js';
import webgl, { gl } from '../game/rendering/webgl.js';
import frameratelimiter from '../game/rendering/frameratelimiter.js';
import { ProgramManager } from '../webgl/ProgramManager.js';

// Constants -------------------------------------------------------------

/** Slow diagonal pan speed in board-relative units per second. */
const PAN_SPEED = 0.7;
const BOARD_SCALE = bigdecimal.fromNumber(1.3);
/**
 * The framerate of the perspective board scrolling animation.
 * Lower = less cpu resources, but choppier.
 */
const ANIMATION_FPS = 30;

// Functions -------------------------------------------------------------

function initCanvasAnimation(): void {
	webgl.init();
	camera.init();
	const programManager = new ProgramManager(gl);
	Renderable.init(gl, programManager);

	initBoard();

	frameratelimiter.setFpsLimit(ANIMATION_FPS); // Title screen throttle
	frameratelimiter.requestFrame(animationLoop);
}
initCanvasAnimation();

function initBoard(): void {
	boardtiles.init();
	boardpos.setBoardScale(BOARD_SCALE);
	boardpos.setPanVel([0, PAN_SPEED]);
	perspective.enable();
	perspective.setRotation(-45, 0); // Minimum angle to hide all sky
}

function animationLoop(runtime: number): void {
	deltatime.update(runtime);

	updateBoard();

	if (frametracker.doWeRenderNextFrame()) {
		webgl.clearScreen();
		renderBoard();
		frametracker.onFrameRender();
	}

	frameratelimiter.requestFrame(animationLoop);
}

function updateBoard(): void {
	boardpos.update();
	boardtiles.recalcVariables();
}

function renderBoard(): void {
	boardtiles.render();
}
