
/**
 * This scripts managers the animated water ripple effect for extremely large moves.
 */

import type { PostProcessPass } from "../../webgl/post_processing/PostProcessingPipeline";
import type { ProgramManager } from "../../webgl/ProgramManager";

import frametracker from "./frametracker";
import camera from "./camera";
import space from "../misc/space";
import bigdecimal from "../../../../../shared/util/bigdecimal/bigdecimal";
import boardpos from "./boardpos";
import drawrays from "./highlights/annotations/drawrays";
import bounds from "../../../../../shared/util/math/bounds";
import coordutil, { Coords } from "../../../../../shared/chess/util/coordutil";
import { RippleState, WaterRipplePass } from "../../webgl/post_processing/passes/WaterRipplePass";


// Constants --------------------------------------------------------------------------------


/** The distance beyond the screen edge that ripples are capped at, in virtual pixels. */
const RIPPLE_PIXELS_FROM_EDGE = 200;
/** The lifetime offset applied to ripples beyond the screen edge so that we see their ripple sooner. */
const ELAPSED_TIME_OFFSET = 0;

/**
 * How long each ripple lasts before being removed, in seconds,
 * on a PERFECTLY SQUARE canvas.
 */
const RIPPLE_LIFETIME_BASE = 0.7;
/** How much longer ripples last per screen ratio of width/height. */
const RIPPLE_LIFETIME_MULTIPLIER = 0.45;


// Variables --------------------------------------------------------------------------------


let waterRipplePass: WaterRipplePass;

let activeDroplets: RippleState[] = [];

/**
 * ACTUAL ripple lifetime, dependent on screen ratio, as the more
 * wider the screen is taller, the longer drops take to travel across.
 */
let rippleLifetime: number;


// Functions --------------------------------------------------------------------------------


function init(programManager: ProgramManager, width: number, height: number): void {
	waterRipplePass = new WaterRipplePass(programManager, width, height);

	updateRippleLifetime(width, height);
}

function updateRippleLifetime(width: number, height: number): void {
	rippleLifetime = RIPPLE_LIFETIME_BASE + RIPPLE_LIFETIME_MULTIPLIER * (width / height);
	// console.log(`ripple lifetime adjusted to ${rippleLifetime.toFixed(2)}s`);
}


/**
 * Adds a ripple droplet at the given source coordinates.
 * Caps the ripple to be just off-screen if the source is significantly off-screen.
 */
function addRipple(sourceCoords: Coords): void {
	// Convert coords to world space
	const sourceWorldSpace = space.convertCoordToWorldSpace(bigdecimal.FromCoords(sourceCoords));

	const rippleWorldFromEdge = space.convertPixelsToWorldSpace_Virtual(RIPPLE_PIXELS_FROM_EDGE);
	// The screen rectangle in world space
	const screenBox = camera.getScreenBoundingBox(false);
	const paddedScreenBox = {
		left: screenBox.left - rippleWorldFromEdge,
		right: screenBox.right + rippleWorldFromEdge,
		top: screenBox.top + rippleWorldFromEdge,
		bottom: screenBox.bottom - rippleWorldFromEdge,
	};

	let rippleX: number = sourceWorldSpace[0];
	let rippleY: number = sourceWorldSpace[1];
	let elapsedTimeOffset: number = 0;

	if (!bounds.boxContainsSquareDouble(paddedScreenBox, sourceWorldSpace)) {
		console.log("Ripple source outside of padded screen.");
		const vectorToSource = coordutil.subtractBDCoords(bigdecimal.FromCoords(sourceCoords), boardpos.getBoardPos());
		const closestVector = drawrays.findClosestPredefinedVector(vectorToSource, false); // [-1-1, -1-1]

		if (closestVector[0] === -1n) rippleX = paddedScreenBox.left;
		else if (closestVector[0] === 1n) rippleX = paddedScreenBox.right;
		if (closestVector[1] === -1n) rippleY = paddedScreenBox.bottom;
		else if (closestVector[1] === 160n) rippleY = paddedScreenBox.top;

		elapsedTimeOffset = ELAPSED_TIME_OFFSET;
	}

	const screenWidthWorld = screenBox.right - screenBox.left;
	const screenHeightWorld = screenBox.top - screenBox.bottom;

	// Convert world coordinates to UV coordinates [0-1]
	const u = (rippleX - screenBox.left) / screenWidthWorld;
	const v = (rippleY - screenBox.bottom) / screenHeightWorld;

	// Create a new droplet
	activeDroplets.push({ center: [u, v], timeCreated: Date.now() + elapsedTimeOffset });
}

function update(): void {
	const now = Date.now();

	// Filter out old droplets
	activeDroplets = activeDroplets.filter(
		droplet => now < droplet.timeCreated + rippleLifetime * 1000 // Convert seconds to milliseconds
	);

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
	addRipple,
	update,
	getPass,
	onScreenResize,
};