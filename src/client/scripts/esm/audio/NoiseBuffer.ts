
// src/client/scripts/esm/audio/NoiseBuffer.ts

/**
 * This module generates procedural audio data noise buffers.
 */

export interface FilterConfig {
	type: BiquadFilterType;
	frequency: number;
	Q?: number;
	gain?: number;
}

/**
 * Generates an AudioBuffer containing custom-shaped noise.
 * It creates white noise and processes it with a chain of BiquadFilterNodes.
 * @param audioContext The main AudioContext (used to get the sampleRate).
 * @param durationSecs The desired duration of the noise buffer in seconds.
 * @param filterConfigs An array of configuration objects for the BiquadFilterNode chain. Each object's properties will be applied to a corresponding BiquadFilterNode.
 * @param crossfadeMillis - The duration in milliseconds over which to crossfade the loop point. Default is 20ms.
 * @returns A Promise that resolves to the generated AudioBuffer containing the processed noise.
 */
async function createCustom(audioContext: AudioContext, durationSecs: number, filterConfigs: FilterConfig[], crossfadeMillis: number = 20): Promise<AudioBuffer> {
	const finalSampleCount = Math.floor(audioContext.sampleRate * durationSecs);
	// Render with additional samples to accommodate cross-fading loop point
	const crossfadeSecs = crossfadeMillis / 1000;
	const crossFadeSampleCount = Math.floor(audioContext.sampleRate * crossfadeSecs);
	const renderSampleCount = finalSampleCount + crossFadeSampleCount;

	// Create an OfflineAudioContext. This is a special context that renders audio
	// as fast as possible in the background, without sending it to the speakers.
	const offlineContext = new OfflineAudioContext(1, renderSampleCount, audioContext.sampleRate);

	// Create a source buffer filled with white noise for our raw material.
	const sourceBuffer = offlineContext.createBuffer(1, renderSampleCount, offlineContext.sampleRate);
	const data = sourceBuffer.getChannelData(0);
	for (let i = 0; i < renderSampleCount; i++) {
		data[i] = Math.random() * 2 - 1;
	}

	// Create a BufferSourceNode to "play" our white noise into the processing chain.
	const sourceNode = offlineContext.createBufferSource();
	sourceNode.buffer = sourceBuffer;

	// Build the filter chain. Sculpt the sound.
	let lastNode: AudioNode = sourceNode; // The last node in the chain

	filterConfigs.forEach(config => {
		const filter = offlineContext.createBiquadFilter();
		
		// Set required AudioParam properties
		filter.type = config.type;
		filter.frequency.value = config.frequency;

		// Set optional AudioParam properties
		if (config.Q !== undefined) filter.Q.value = config.Q;
		if (config.gain !== undefined) filter.gain.value = config.gain;

		// Connect the previous node to this new filter, and update 'lastNode'.
		lastNode.connect(filter);
		lastNode = filter;
	});

	// Connect the end of our chain to the final destination.
	lastNode.connect(offlineContext.destination);

	// Start the source and begin rendering. This is what's async.
	sourceNode.start(0);
	const renderedBuffer = await offlineContext.startRendering();

	const finalBuffer = audioContext.createBuffer(1, finalSampleCount, audioContext.sampleRate);
	const finalData = finalBuffer.getChannelData(0);
	const renderedData = renderedBuffer.getChannelData(0);

	// Copy the main portion of the rendered buffer to the final buffer
	for (let i = 0; i < finalSampleCount; i++) {
		finalData[i] = renderedData[i]!;
	}

	// Cross-fade the loop point with the samples at the start.
	if (crossFadeSampleCount > finalSampleCount / 2) console.warn("Crossfade duration is too long relative to total buffer length.");
	else if (crossFadeSampleCount > 0) {
		// Crossfade the extra tail samples with the head of our final buffer
		for (let i = 0; i < crossFadeSampleCount; i++) {
			// Progress from 0.0 to 1.0 over the fade duration
			const progress = i / (crossFadeSampleCount - 1);

			const fadeOutGain = 1 - progress;
			const fadeInGain = progress;

			// The sample from the head that's fading in (already in finalData)
			const headSample = finalData[i]!;
			// The sample from the extra tail that's fading out (in the renderedData)
			const tailSample = renderedData[finalSampleCount + i]!;
			
			const blendedSample = (tailSample * fadeOutGain) + (headSample * fadeInGain);

			// Overwrite the head of the final buffer with the blended result
			finalData[i] = blendedSample;
		}
	}
	
	// Normalize the final buffer to prevent clipping and ensure consistent volume.
	// Filtering can drastically change amplitude.
	let peak = 0.0;
	for (let i = 0; i < finalData.length; i++) {
		const absValue = Math.abs(finalData[i]!);
		if (absValue > peak) peak = absValue;
	}
	if (peak > 0) {
		const scale = 1.0 / peak;
		for (let i = 0; i < finalData.length; i++) {
			finalData[i]! *= scale;
		}
	}
	
	return finalBuffer;
}

export default {
	createCustom,
};