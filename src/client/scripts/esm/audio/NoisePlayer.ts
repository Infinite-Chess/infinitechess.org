
// src/client/scripts/esm/audio/NoisePlayer.ts

/**
 * This module provides controllable, procedurally generated noise players.
 */


import AudioManager from "./AudioManager";
import NoiseBuffer, { FilterConfig } from "./NoiseBuffer";


// Type Definitions ----------------------------------------------------------------------------------


/** The control interface for a noise player. */
export interface INoisePlayer {
	start: () => void;
	stop: () => void;
	// eslint-disable-next-line no-unused-vars
	fadeIn: (targetVolume: number, durationMillis: number) => void;
	// eslint-disable-next-line no-unused-vars
	fadeOut: (durationMillis: number) => void;
}


// Constants ----------------------------------------------------------------------------------


/** The number of points to use when generating fade curves. Higher = smoother, but more CPU. */
const FADE_CURVE_RESOLUTION = 100;

/**
 * Higher = Exponential ramp gets more weight at beginning, Linear ramp gets more weight at end.
 * Range:
 * 	   0.0 (perfect 50% blend of linear and exponential throughout time t)
 *     to 0.5 (100% exponential ramp at start, 100% linear ramp at end)
 */
const FADE_RAMP_CURVATURE = 0.4;


// Noise Generation ---------------------------------------------------------------------------------


/**
 * Generates a noise player based on the provided configuration.
 * To play, you must also call fadeIn() after start().
 * @param durationSecs The duration of the noise buffer to generate.
 * @param filterConfigs The filter configuration for shaping the noise.
 * @returns A Promise that resolves to a player with start and stop controls.
 */
export async function create(durationSecs: number, filterConfigs: FilterConfig[]): Promise<INoisePlayer> {
	// console.log("Generating noise buffer...");
	const audioContext: AudioContext = AudioManager.getContext();
	const noiseBuffer: AudioBuffer = await NoiseBuffer.createCustom(audioContext, durationSecs, filterConfigs);

	// Create a GainNode for volume control.
	const masterGain: GainNode = audioContext.createGain();
	// This connection is permanent. We will connect sources to this node.
	masterGain.connect(audioContext.destination);
	// Start with the volume at 0, so it's silent until fadeIn is called.
	masterGain.gain.value = 0.0;

	let sourceNode: AudioBufferSourceNode | null = null;

	/** Controls the weight the exponential ramp gets over the linear ramp over time t. */
	const easeFunction = (t: number): number => FADE_RAMP_CURVATURE * Math.sin(Math.PI * t + 0.5 * Math.PI) + 0.5;

	return {
		start: (): void => {
			// Stop and clear any existing sound before starting a new one.
			if (sourceNode) {
				sourceNode.stop(0);
				sourceNode.disconnect();
			}

			// Create a new BufferSourceNode when we start.
			sourceNode = audioContext.createBufferSource();
			sourceNode.buffer = noiseBuffer;
			sourceNode.loop = true;

			// Connect to the masterGain node instead of the destination.
			sourceNode.connect(masterGain);
			sourceNode.start(0);
		},
		stop: (): void => {
			if (!sourceNode) return; // Already stopped

			// Stop and disconnect the source node.
			// We also clear the reference to it so we can create a new one on the next start().
			sourceNode.stop(0);
			sourceNode.disconnect();
			sourceNode = null; // Clear the reference

			// Also reset the gain to 0 for a clean state.
			masterGain.gain.cancelScheduledValues(audioContext.currentTime);
			masterGain.gain.setValueAtTime(0, audioContext.currentTime);
		},
		fadeIn: (targetVolume: number, durationMillis: number): void => {
			applyPerceptualFade(audioContext, masterGain.gain, targetVolume, durationMillis, easeFunction, FADE_CURVE_RESOLUTION, false);
		},
		fadeOut: (durationMillis: number): void => {
			applyPerceptualFade(audioContext, masterGain.gain, 0, durationMillis, easeFunction, FADE_CURVE_RESOLUTION, true);
		}
	};
}

/**
 * Applies a perceptually-blended fade with a dynamic blending curve.
 * This can be tuned between linear and exponential ramps
 * providing a more natural-sounding fade.
 * @param audioContext The active AudioContext.
 * @param gainParam The gain AudioParam to be modified.
 * @param targetVolume The final volume (amplitude) for the fade.
 * @param durationMillis The duration of the fade in milliseconds.
 * @param blendRatio A function that returns the blend ratio (0.0 to 1.0) for a given normalized time t (0.0 to 1.0). Higher = more exponential. Lower = more linear.
 * @param resolution The number of points to calculate for the curve. Higher is smoother.
 * @param isFadeOut Whether this is a fade-out (true) or fade-in (false).
 */
function applyPerceptualFade(
	audioContext: AudioContext,
	gainParam: AudioParam,
	targetVolume: number,
	durationMillis: number,
	// eslint-disable-next-line no-unused-vars
	blendRatio: (t: number) => number,
	resolution: number,
	isFadeOut: boolean
): void {
	const now: number = audioContext.currentTime;
	const startVolume: number = gainParam.value;

	gainParam.cancelScheduledValues(now);
	gainParam.setValueAtTime(startVolume, now);

	const curve: Float32Array = new Float32Array(resolution);
	const MIN_GAIN = 0.00001; 
	const effectiveStart = Math.max(startVolume, MIN_GAIN);
	const effectiveTarget = Math.max(targetVolume, MIN_GAIN);

	for (let i = 0; i < resolution; i++) {
		const progress: number = i / (resolution - 1); // Our 't' from 0.0 to 1.0
		const blendProgress = isFadeOut ? 1 - progress : progress; // Reverse for fade-out
		const currentRatio = blendRatio(blendProgress);

		// Calculate what the points would be for pure linear and pure exponential ramps.
		const linearPoint = startVolume + (targetVolume - startVolume) * progress;
		const exponentialPoint = effectiveStart * Math.pow(effectiveTarget / effectiveStart, progress);

		// Blend the two points using the ratio.
		curve[i] = linearPoint * (1 - currentRatio) + exponentialPoint * currentRatio;
	}
	
	curve[resolution - 1] = targetVolume;

	gainParam.setValueCurveAtTime(curve, now, durationMillis / 1000);
}


// Exports --------------------------------------------------------------------------------


export default {
	create,
};