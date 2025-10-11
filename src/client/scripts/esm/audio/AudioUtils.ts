
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
	const startVolume: number = gainParam.value;

	gainParam.cancelScheduledValues(now);

	const curve: Float32Array = new Float32Array(FADE_CURVE_RESOLUTION);
	const MIN_GAIN = 0.00001; 
	const effectiveStart = Math.max(startVolume, MIN_GAIN);
	const effectiveTarget = Math.max(targetVolume, MIN_GAIN);

	const easeFunction = (t: number): number => FADE_RAMP_CURVATURE * Math.sin(Math.PI * t + 0.5 * Math.PI) + 0.5;

	for (let i = 0; i < FADE_CURVE_RESOLUTION; i++) {
		const progress: number = i / (FADE_CURVE_RESOLUTION - 1); // Our 't' from 0.0 to 1.0
		const isFadeOut = targetVolume < startVolume;
		const blendProgress = isFadeOut ? 1 - progress : progress; // Reverse for fade-out
		const currentRatio = easeFunction(blendProgress);

		// Calculate what the points would be for pure linear and pure exponential ramps.
		const linearPoint = startVolume + (targetVolume - startVolume) * progress;
		const exponentialPoint = effectiveStart * Math.pow(effectiveTarget / effectiveStart, progress);

		// Blend the two points using the ratio.
		curve[i] = linearPoint * (1 - currentRatio) + exponentialPoint * currentRatio;
	}
	
	curve[FADE_CURVE_RESOLUTION - 1] = targetVolume;
	gainParam.setValueCurveAtTime(curve, now, durationMillis / 1000);
}


// Exports ----------------------------------------------------------------------------------


export default {
	applyPerceptualFade,
};