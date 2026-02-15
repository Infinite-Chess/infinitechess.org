// src/client/scripts/esm/game/rendering/borderanimation.ts

/**
 * This script manages a temporary border expansion animation.
 * Triggered by the H key, it expands the world border over 16 beats.
 */

import type { FullGame } from '../../../../../shared/chess/logic/gamefile.js';
import type { InputListener } from '../input.js';

// Constants ---------------------------------------------------------------

/** Beats per minute for the animation. */
const BPM = 127;

/** Duration of one beat in milliseconds. */
const BEAT_DURATION_MS = (60 / BPM) * 1000;

/** Total duration of the animation in beats. */
const ANIMATION_DURATION_BEATS = 16;

/** Initial border before animation starts: [left, bottom, right, top]. */
const INITIAL_BORDER = { left: 1n, bottom: 1n, right: 8n, top: 8n };

// Variables ---------------------------------------------------------------

/** Whether the animation is currently active. */
let isAnimating = false;

/** The timestamp when the animation started (in milliseconds). */
let animationStartTime = 0;

/** Whether the H key was pressed in the previous frame. */
let wasHKeyPressed = false;

// Functions ---------------------------------------------------------------

/**
 * Calculates which border expansion number we should be at based on elapsed beats.
 * Returns the number of completed expansions (1 = first expansion completed at beat 0).
 */
function calculateExpansionNumber(elapsedBeats: number): number {
	if (elapsedBeats < 0) return 0; // Before animation starts, no expansions
	if (elapsedBeats >= ANIMATION_DURATION_BEATS) return Infinity;

	// The expansion schedule follows a pattern:
	// - 1st through 8th expansions: 1 per beat (total 8 beats)
	// - 9th through 16th expansions: 2 per beat (total 4 beats)
	// - 17th through 24th expansions: 4 per beat (total 2 beats)
	// - 25th through 32nd expansions: 8 per beat (total 1 beat)
	// - And so on, doubling the rate every 8 expansions

	// The cumulative beats at the start of each phase:
	// Phase 0 (1st-8th expansions):   0 beats
	// Phase 1 (9th-16th expansions):  8 beats
	// Phase 2 (17th-24th expansions): 12 beats
	// Phase 3 (25th-32nd expansions): 14 beats
	// Phase 4 (33rd-40th expansions): 15 beats
	// Phase n: 16 - 8/2^n beats

	let totalExpansions = 0;
	let phaseStartBeat = 0;

	// Iterate through each phase
	// We need at most log2(8 * 2^16 / 1) = log2(524288) ≈ 19.0 phases
	// to cover the entire 16-beat animation, so 20 is a safe upper bound.
	for (let phase = 0; phase < 20; phase++) {
		const expansionsPerBeat = Math.pow(2, phase);
		const beatsInPhase = 8 / expansionsPerBeat;
		const phaseEndBeat = phaseStartBeat + beatsInPhase;

		if (elapsedBeats < phaseEndBeat) {
			// We're in this phase
			const beatsIntoPhase = elapsedBeats - phaseStartBeat;
			const expansionsInPhase = beatsIntoPhase * expansionsPerBeat;
			totalExpansions += expansionsInPhase;
			break;
		}

		// Move to next phase
		totalExpansions += 8;
		phaseStartBeat = phaseEndBeat;
	}

	// Add 1 to account for the first expansion at beat 0
	// (The loop calculates 0 at beat 0, but we want to return 1)
	return Math.floor(totalExpansions) + 1;
}

/**
 * Calculates the border size based on the number of expansions.
 * Each expansion increases the border by 1 on each side.
 */
function calculateBorderSize(expansionNumber: number): {
	left: bigint;
	bottom: bigint;
	right: bigint;
	top: bigint;
} {
	const expansion = BigInt(expansionNumber);
	return {
		left: INITIAL_BORDER.left - expansion,
		bottom: INITIAL_BORDER.bottom - expansion,
		right: INITIAL_BORDER.right + expansion,
		top: INITIAL_BORDER.top + expansion,
	};
}

/**
 * Updates the border animation state. Should be called every frame from game.update().
 * @param listener_document - The input listener for detecting key presses
 * @param gamefile - The currently loaded game file
 */
function update(listener_document: InputListener, gamefile: FullGame | undefined): void {
	// Check if H key is pressed (trigger the animation)
	const isHKeyPressed = listener_document.isKeyDown('KeyH');

	// Detect H key press (trigger on key down, not held)
	if (isHKeyPressed && !wasHKeyPressed && gamefile) {
		// Start the animation
		isAnimating = true;
		animationStartTime = performance.now();
	}

	wasHKeyPressed = isHKeyPressed;

	// Update animation if active
	if (isAnimating && gamefile) {
		const currentTime = performance.now();
		const elapsedMs = currentTime - animationStartTime;
		const elapsedBeats = elapsedMs / BEAT_DURATION_MS;

		// Calculate current border size
		const expansionNumber = calculateExpansionNumber(elapsedBeats);

		if (expansionNumber === Infinity) {
			// Animation complete - set border to undefined (infinite)
			gamefile.basegame.gameRules.worldBorder = undefined;
			isAnimating = false;
		} else {
			// Update border size
			const borderSize = calculateBorderSize(expansionNumber);
			gamefile.basegame.gameRules.worldBorder = {
				left: borderSize.left,
				bottom: borderSize.bottom,
				right: borderSize.right,
				top: borderSize.top,
			};
		}
	}
}

// Exports -----------------------------------------------------------------

export default {
	update,
};
