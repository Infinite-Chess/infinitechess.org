// src/client/scripts/esm/game/rendering/WaterRipples.ts

/**
 * This scripts managers the animated water ripple effect for extremely large moves.
 */

import type { PostProcessPass } from '../../webgl/post_processing/PostProcessingPipeline';
import type { ProgramManager } from '../../webgl/ProgramManager';

import frametracker from './frametracker';
import camera from './camera';
import space from '../misc/space';
import bd from '../../../../../shared/util/bigdecimal/bigdecimal';
import boardpos from './boardpos';
import drawrays from './highlights/annotations/drawrays';
import bounds from '../../../../../shared/util/math/bounds';
import perspective from './perspective';
import gameloader from '../chess/gameloader';
import coordutil, { Coords } from '../../../../../shared/chess/util/coordutil';
import { players as p } from '../../../../../shared/chess/util/typeutil';
import { RippleState, WaterRipplePass } from '../../webgl/post_processing/passes/WaterRipplePass';

// Constants --------------------------------------------------------------------------------

/**
 * The distance beyond the screen edge that ripples are capped at, in virtual pixels,
 * PER virtual pixel of screen height, as the ripple speed is proportional to screen height.
 */
const RIPPLE_DIST_FROM_EDGE = 0.54; // Default: 0.54
/** The lifetime offset applied to ripples beyond the screen edge so that we see their ripple sooner. */
const ELAPSED_TIME_OFFSET = -230; // Default: -230

/**
 * How long each ripple lasts before being removed, in seconds,
 * on a PERFECTLY SQUARE canvas.
 */
const RIPPLE_LIFETIME_BASE = 1.1;
/** How much longer ripples last per screen ratio of width/height. */
const RIPPLE_LIFETIME_MULTIPLIER = 0.5;

// Variables --------------------------------------------------------------------------------

let waterRipplePass: WaterRipplePass;

const activeDroplets: RippleState[] = [];

/**
 * ACTUAL ripple lifetime, dependent on screen ratio, as the more
 * wider the screen is taller, the longer drops take to travel across.
 */
let rippleLifetime: number;

// Functions --------------------------------------------------------------------------------

function init(programManager: ProgramManager, width: number, height: number): void {
	waterRipplePass = new WaterRipplePass(programManager, width, height);

	updateRippleLifetime(width, height);

	// The post processing effect relies on the dimensions of the canvas.
	// Init listener for screen resize
	document.addEventListener('canvas_resize', (event) => {
		const { width, height } = event.detail;
		waterRipplePass.setResolution(width, height);
		updateRippleLifetime(width, height);
	});
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
	const sourceWorldSpace = space.convertCoordToWorldSpace(bd.FromCoords(sourceCoords));

	const screenHeight = camera.canvas.height / window.devicePixelRatio;
	const pixelPadding = RIPPLE_DIST_FROM_EDGE * screenHeight;
	const rippleWorldFromEdge = space.convertPixelsToWorldSpace_Virtual(pixelPadding);
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

	// Don't let the ripple source be too far off-screen
	if (!bounds.boxContainsSquareDouble(paddedScreenBox, sourceWorldSpace)) {
		// console.log("Ripple source outside of padded screen.");
		const vectorToSource = coordutil.subtractBDCoords(
			bd.FromCoords(sourceCoords),
			boardpos.getBoardPos(),
		);
		const closestVector = drawrays.findClosestPredefinedVector(vectorToSource, false); // [-1-1, -1-1]

		if (closestVector[0] === 0n) {
			rippleX = 0;
			if (closestVector[1] === -1n) rippleY = paddedScreenBox.bottom;
			else if (closestVector[1] === 1n) rippleY = paddedScreenBox.top;
		} else if (closestVector[0] === 1n) {
			rippleX = paddedScreenBox.right;
			if (closestVector[1] === 0n) rippleY = 0;
			else if (closestVector[1] === 1n) rippleY = paddedScreenBox.top;
			else if (closestVector[1] === -1n) rippleY = paddedScreenBox.bottom;
		} else if (closestVector[0] === -1n) {
			rippleX = paddedScreenBox.left;
			if (closestVector[1] === 0n) rippleY = 0;
			else if (closestVector[1] === 1n) rippleY = paddedScreenBox.top;
			else if (closestVector[1] === -1n) rippleY = paddedScreenBox.bottom;
		}

		// More offset for diagonals to account for greater distance from screen edge to ripple source
		const isDiagonal = closestVector[0] !== 0n && closestVector[1] !== 0n;
		elapsedTimeOffset = isDiagonal ? ELAPSED_TIME_OFFSET * 1.7 : ELAPSED_TIME_OFFSET;
	}

	const screenWidthWorld = screenBox.right - screenBox.left;
	const screenHeightWorld = screenBox.top - screenBox.bottom;

	// Convert world coordinates to UV coordinates [0-1]
	let u = (rippleX - screenBox.left) / screenWidthWorld;
	let v = (rippleY - screenBox.bottom) / screenHeightWorld;

	// If we're playing black, negate the UV coordinates
	if (!gameloader.areInLocalGame() && gameloader.getOurColor() === p.BLACK) {
		u = 1 - u;
		v = 1 - v;
	}

	// Create a new droplet
	activeDroplets.push({ center: [u, v], timeCreated: Date.now() + elapsedTimeOffset });
}

function update(): void {
	const now = Date.now();

	// Filter out old droplets
	for (let i = activeDroplets.length - 1; i >= 0; i--) {
		const droplet = activeDroplets[i]!;
		if (now >= droplet.timeCreated + rippleLifetime * 1000) {
			// Convert seconds to milliseconds
			activeDroplets.splice(i, 1);
			// console.log("Removed ripple droplet.");
		}
	}

	// Don't render ripple effect in perspective mode, as it is a pure
	// 2D post processing effect, not an effect on the rendered board.
	const framesActiveDrops = perspective.getEnabled() ? [] : activeDroplets;

	// FEED the active list to the pass
	waterRipplePass.updateDroplets(framesActiveDrops);

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

export default {
	init,
	addRipple,
	update,
	getPass,
};
