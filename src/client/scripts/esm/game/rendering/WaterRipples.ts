
/**
 * This scripts managers the animated water ripple effect for extremely large moves.
 */

import { RippleState, WaterRipplePass } from "../../webgl/post_processing/passes/WaterRipplePass";
import { PostProcessPass } from "../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../webgl/ProgramManager";
import frametracker from "./frametracker";
// [TESTING]
import { listener_overlay } from "../chess/game";
import { Mouse } from "../input";
import camera from "./camera";



// Variables --------------------------------------------------------------------------------


let waterRipplePass: WaterRipplePass;

let activeDroplets: RippleState[] = [];

/**
 * How long each ripple lasts before being removed, in seconds,
 * on a PERFECTLY SQUARE canvas.
 */
const RIPPLE_LIFETIME_BASE = 0.7;
/** How much longer ripples last per screen ratio of width/height. */
const RIPPLE_LIFETIME_MULTIPLIER = 0.45;

/**
 * ACTUAL ripple lifetime, dependent on screen ratio, as the more
 * wider the screen is taller, the longer drops take to travel across.
 */
let rippleLifetime: number;


// Functions --------------------------------------------------------------------------------


function init(programManager: ProgramManager, width: number, height: number): void {
	waterRipplePass = new WaterRipplePass(programManager, width, height);
	// waterRipplePass.propagationSpeed = 0.2;
	// waterRipplePass.oscillationSpeed = 4;

	updateRippleLifetime(width, height);
}

function updateRippleLifetime(width: number, height: number): void {
	rippleLifetime = RIPPLE_LIFETIME_BASE + RIPPLE_LIFETIME_MULTIPLIER * (width / height);
	// console.log(`ripple lifetime adjusted to ${rippleLifetime.toFixed(2)}s`);
}

function update(): void {
	const now = Date.now();

	// Filter out old droplets
	activeDroplets = activeDroplets.filter(
		droplet => now < droplet.timeCreated + rippleLifetime * 1000 // Convert seconds to milliseconds
	);


	// [TESTING] Add a new droplet on mouse click
	// if (listener_overlay.isMouseClicked(Mouse.LEFT)) {
	// 	const mousePos = listener_overlay.getMousePosition(Mouse.LEFT)!;

	// 	// Convert world space to uv space
	// 	const rect = camera.canvas.getBoundingClientRect();

	// 	// Convert pixel coordinates to UV coordinates [0-1]
	// 	const u = mousePos[0] / rect.width;
	// 	const v = 1.0 - mousePos[1] / rect.height; // Y is inverted in WebGL

	// 	// Create a new droplet with an elapsed time of 0
	// 	activeDroplets.push({ center: [u, v], timeCreated: now });
	// }


	// FEED the active list to the pass
	waterRipplePass.updateDroplets(activeDroplets);

	// Only call for an animation frame if there are active droplets
	if (activeDroplets.length > 0) frametracker.onVisualChange();
}

/**
 * Returns the WaterRipplePass instance this frame to be added to
 * the post-processing pipeline, if there are any visible drops.
 */
function getPass(): PostProcessPass[] {
	if (activeDroplets.length === 0) return [];
	return [waterRipplePass];
}

/** The post processing effect relies on the dimensions of the canvas. */
function onScreenResize(width: number, height: number): void {
	waterRipplePass.setResolution(width, height);
	updateRippleLifetime(width, height);
}


export default {
	init,
	update,
	getPass,
	onScreenResize,
};