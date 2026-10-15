// src/client/scripts/esm/board/rendering/WaterRipples.ts

/**
 * This scripts managers the animated water ripple effect for extremely large moves.
 * Each live board owns its own ripples, threaded through every function here.
 */

import type LiveBoard from './LiveBoard.js';
import type { Coords } from '../../../../../shared/util/coordutil.js';
import type { ProgramManager } from '../../webgl/ProgramManager.js';
import type { PostProcessPass } from '../../webgl/postprocessing/PostProcessPass.js';

import bounds from '../../../../../shared/util/math/bounds.js';
import vectors from '../../../../../shared/util/math/vectors.js';
import bdcoords from '../../../../../shared/util/bdcoords.js';
import coordutil from '../../../../../shared/util/coordutil.js';

import space from './space.js';
import { RippleState, WaterRipplePass } from '../../webgl/postprocessing/passes/WaterRipplePass.js';

// Types -----------------------------------------------------------------------

/** One board's ripple effect: its post-processing pass and the droplets currently rippling. */
export interface Ripples {
	pass: WaterRipplePass;
	droplets: RippleState[];
	/**
	 * ACTUAL ripple lifetime, dependent on screen ratio, as the more
	 * wider the screen is taller, the longer drops take to travel across.
	 */
	lifetime: number;
}

// Constants -------------------------------------------------------------------

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

// Functions -------------------------------------------------------------------

/** Creates a board's ripples, sized to its canvas. */
function create(programManager: ProgramManager, width: number, height: number): Ripples {
	return {
		pass: new WaterRipplePass(programManager, width, height),
		droplets: [],
		lifetime: getLifetime(width, height),
	};
}

/** Resizes the ripples to their board's new canvas dimensions. The post processing effect relies on them. */
function resize(ripples: Ripples, width: number, height: number): void {
	ripples.pass.setResolution(width, height);
	ripples.lifetime = getLifetime(width, height);
}

/** The lifetime of a ripple, in seconds, on a canvas of the given dimensions. */
function getLifetime(width: number, height: number): number {
	return RIPPLE_LIFETIME_BASE + RIPPLE_LIFETIME_MULTIPLIER * (width / height);
}

/**
 * Adds a ripple droplet at the given source coordinates.
 * Caps the ripple to be just off-screen if the source is significantly off-screen.
 */
function addRipple(board: LiveBoard, sourceCoords: Coords): void {
	const { camera, boardpos } = board;
	// Convert coords to world space
	const sourceWorldSpace = space.convertCoordToWorldSpace(
		bdcoords.fromCoords(sourceCoords),
		boardpos.getBoardPos(),
		boardpos.getBoardScale(),
	);

	const screenHeight = camera.getCanvas().height / window.devicePixelRatio;
	const pixelPadding = RIPPLE_DIST_FROM_EDGE * screenHeight;
	const rippleWorldFromEdge = space.convertPixelsToWorldSpace_Virtual(camera, pixelPadding);
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
			bdcoords.fromCoords(sourceCoords),
			boardpos.getBoardPos(),
		);
		const closestVector = vectors.findClosestPredefinedVector(vectorToSource, false); // [-1-1, -1-1]

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

	// If we're viewing black's perspective, negate the UV coordinates
	if (camera.getIsViewingBlackPerspective()) {
		u = 1 - u;
		v = 1 - v;
	}

	// Create a new droplet
	board.ripples.droplets.push({ center: [u, v], timeCreated: Date.now() + elapsedTimeOffset });
}

/**
 * Drops expired droplets and feeds the rest to the pass.
 * @param suppressed - Whether to hide every ripple this frame. Perspective mode does, as the
 * effect is a pure 2D post-processing one, not an effect on the rendered board.
 */
function update(board: LiveBoard, suppressed: boolean): void {
	const { droplets, lifetime, pass } = board.ripples;
	const now = Date.now();

	// Filter out old droplets
	for (let i = droplets.length - 1; i >= 0; i--) {
		const droplet = droplets[i]!;
		if (now >= droplet.timeCreated + lifetime * 1000) {
			// Convert seconds to milliseconds
			droplets.splice(i, 1);
			// console.log("Removed ripple droplet.");
		}
	}

	// FEED the active list to the pass
	pass.updateDroplets(suppressed ? [] : droplets);

	// Only call for an animation frame if there are active droplets
	if (droplets.length > 0) board.frames.onVisualChange();
}

/**
 * Returns the WaterRipplePass instance this frame to be added to
 * the post-processing pipeline, if there are any visible drops.
 */
function getPass(board: LiveBoard): PostProcessPass[] {
	if (board.ripples.droplets.length === 0) return [];
	return [board.ripples.pass];
}

export default {
	create,
	resize,
	addRipple,
	update,
	getPass,
};
