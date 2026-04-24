// src/client/scripts/esm/game/rendering/renderanims.ts

/**
 * This script manages and renders short-lived visual effect animations,
 * such as pulse circles. It is distinct from animation.ts, which handles
 * chess piece movement animations.
 *
 * New animation types can be added here in the future.
 */

import type { Color } from '../../../../../shared/util/math/math.js';
import type { DoubleCoords } from '../../../../../shared/chess/util/coordutil.js';

import math from '../../../../../shared/util/math/math.js';

import boardpos from './boardpos.js';
import primitives from './primitives.js';
import frametracker from './frametracker.js';
import { createRenderable } from '../../webgl/Renderable.js';

// Pulse animation -----------------------------------------------------------------------

interface PulseAnim {
	/** Fixed world-space origin. Does NOT follow board pan over the animation's lifetime. */
	worldCoords: DoubleCoords;
	/** Timestamp of creation, from performance.now() */
	startTime: number;
}

/** Duration of a single pulse animation in milliseconds. */
const PULSE_DURATION_MS = 250;
/** Maximum radius of the pulse circle in world-space units (at boardScale=1). Scaled by boardScale at render time. */
const PULSE_MAX_RADIUS = 0.65;
/** Number of triangles used to approximate the pulse circle. */
const PULSE_RESOLUTION = 24;
/** Color of the pulse: white, with alpha controlled by animation progress. */
const PULSE_COLOR_RGB: [number, number, number] = [1, 1, 1];

const pulses: PulseAnim[] = [];

/**
 * Starts a new pulse animation at the given world-space coordinates.
 * The pulse origin is fixed in world space and does not pan with the board.
 */
function startPulse(worldCoords: DoubleCoords): void {
	pulses.push({ worldCoords, startTime: performance.now() });
	frametracker.onVisualChange();
}

/**
 * Removes any pulse animations that have completed their lifetime.
 * Call once per frame from the game update loop.
 */
function update(): void {
	const now = performance.now();
	let i = pulses.length;
	while (i--) {
		if (now - pulses[i]!.startTime >= PULSE_DURATION_MS) pulses.splice(i, 1);
	}
	if (pulses.length > 0) frametracker.onVisualChange(); // Keep rendering while pulses are alive
}

/**
 * Renders all active pulse animations.
 * Call once per frame from the game render loop.
 */
function render(): void {
	if (pulses.length === 0) return;

	const now = performance.now();
	const boardScale = boardpos.getBoardScaleAsNumber();

	for (const pulse of pulses) {
		const elapsed = now - pulse.startTime;
		const t = Math.min(elapsed / PULSE_DURATION_MS, 1);
		const tEased = math.easeOut(t);

		const radius = PULSE_MAX_RADIUS * boardScale * tEased;
		const opacity = 1 - t;

		const color: Color = [...PULSE_COLOR_RGB, opacity];
		// prettier-ignore
		const data = primitives.Circle(pulse.worldCoords[0], pulse.worldCoords[1], radius, PULSE_RESOLUTION, color);
		createRenderable(data, 2, 'TRIANGLES', 'color', true).render();
	}
}

export default {
	startPulse,
	update,
	render,
};
