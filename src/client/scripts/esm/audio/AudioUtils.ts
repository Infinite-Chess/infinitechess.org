
// src/client/scripts/esm/audio/AudioUtils.ts

/**
 * This module provides generic, reusable utility functions for working with the Web Audio API.
 */


// Constants --------------------------------------------------------------------------------


/** The number of points to use when generating fade curves. Higher = smoother, but more CPU. */
const FADE_CURVE_RESOLUTION = 100;

/**
 * Higher = Exponential ramp gets more weight at beginning, Linear ramp gets more weight at end.
 * Range:
 * 	   0.0 (perfect 50% blend of linear and exponential throughout time t)
 *     to 0.5 (100% exponential ramp at start, 100% linear ramp at end)
 */
const FADE_RAMP_CURVATURE = 0.4;


// Utility -----------------------------------------------------------------------------------


/**
 * Applies a perceptually-blended fade with a dynamic blending curve to any AudioParam.
 * This can be tuned between linear and exponential ramps, providing a more natural-sounding fade.
 * @param audioContext The active AudioContext.
 * @param gainParam The gain AudioParam to be modified.
 * @param targetVolume The final volume (amplitude) for the fade.
 * @param durationMillis The duration of the fade in milliseconds.
 */
function applyPerceptualFade(audioContext: AudioContext, gainParam: AudioParam, targetVolume: number, durationMillis: number): void {
	const now: number = audioContext.currentTime;
	const durationSeconds = durationMillis / 1000;
	const startVolume: number = gainParam.value;

	// In Firefox, this DOESN'T CANCEL value curves currently active! Use linear ramps instead!
	gainParam.cancelScheduledValues(now);

	// Anchor the start point to prevent popping
	gainParam.setValueAtTime(startVolume, now);

	const MIN_GAIN = 0.00001; 
	const effectiveStart = Math.max(startVolume, MIN_GAIN);
	const effectiveTarget = Math.max(targetVolume, MIN_GAIN);

	const easeFunction = (t: number): number => FADE_RAMP_CURVATURE * Math.sin(Math.PI * t + 0.5 * Math.PI) + 0.5;

	// Generate segments and schedule them as linear ramps
	// We start from i=1 because i=0 is our starting anchor set above at 'now'
	for (let i = 1; i <= FADE_CURVE_RESOLUTION; i++) {
		const progress = i / FADE_CURVE_RESOLUTION; // 0.0 to 1.0
        
		// Calculate the specific time for this segment
		const timeOffset = progress * durationSeconds;
		const scheduledTime = now + timeOffset;

		// Calculate the volume value for this segment
		const isFadeOut = targetVolume < startVolume;
		const blendProgress = isFadeOut ? 1 - progress : progress;
		const currentRatio = easeFunction(blendProgress);

		const linearPoint = startVolume + (targetVolume - startVolume) * progress;
		const exponentialPoint = effectiveStart * Math.pow(effectiveTarget / effectiveStart, progress);
        
		const value = linearPoint * (1 - currentRatio) + exponentialPoint * currentRatio;

		// 6. Schedule the ramp segment
		gainParam.linearRampToValueAtTime(value, scheduledTime);
	}
}


// Exports ----------------------------------------------------------------------------------


export default {
	applyPerceptualFade,
};