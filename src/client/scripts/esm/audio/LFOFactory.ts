
import { LFOConfig } from "./SoundscapePlayer";

/** Minified Simplex Noise generator */
const SimplexNoise = (() => { const F2 = 0.5 * (Math.sqrt(3.0) - 1.0), G2 = (3.0 - Math.sqrt(3.0)) / 6.0; const grad3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]]; const p = [151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180]; const perm = new Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; const dot = (g: number[], x: number, y: number): number => g[0]! * x + g[1]! * y; return { noise: function(xin: number, yin: number) { let n0, n1, n2; const s = (xin + yin) * F2; const i = Math.floor(xin + s), j = Math.floor(yin + s); const t = (i + j) * G2; const X0 = i - t, Y0 = j - t; const x0 = xin - X0, y0 = yin - Y0; let i1, j1; if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; } const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2; const x2 = x0 - 1.0 + 2.0 * G2, y2 = y0 - 1.0 + 2.0 * G2; const ii = i & 255, jj = j & 255; const gi0 = perm[ii + perm[jj]] % 12, gi1 = perm[ii + i1 + perm[jj + j1]] % 12, gi2 = perm[ii + 1 + perm[jj + 1]] % 12; let t0 = 0.5 - x0 * x0 - y0 * y0; if (t0 < 0) n0 = 0.0; else { t0 *= t0; n0 = t0 * t0 * dot(grad3[gi0]!, x0, y0); } let t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 < 0) n1 = 0.0; else { t1 *= t1; n1 = t1 * t1 * dot(grad3[gi1]!, x1, y1); } let t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 < 0) n2 = 0.0; else { t2 *= t2; n2 = t2 * t2 * dot(grad3[gi2]!, x2, y2); } return 70.0 * (n0 + n1 + n2); } }; })();

let perlinNoiseBuffer: AudioBuffer | null = null;

function createPerlinLFO(context: AudioContext, rate: number): AudioBufferSourceNode {
	if (!perlinNoiseBuffer) {
		const duration = 30; // 30 seconds long buffer
		const sampleCount = context.sampleRate * duration;
		perlinNoiseBuffer = context.createBuffer(1, sampleCount, context.sampleRate);
		const data = perlinNoiseBuffer.getChannelData(0);
		for (let i = 0; i < sampleCount; i++) {
			data[i] = SimplexNoise.noise(i / 40000, 0);
		}
	}
	const lfoSource = context.createBufferSource();
	lfoSource.buffer = perlinNoiseBuffer;
	lfoSource.loop = true;
	lfoSource.playbackRate.value = rate;
	return lfoSource;
}

/** A container for an LFO's audio nodes. */
export interface LFOUnit {
	source: AudioNode;
	gain: GainNode;
}

/**
 * A factory for creating LFO (Low-Frequency Oscillator) units.
 * @param context The global AudioContext.
 * @param config The configuration for the LFO.
 * @returns An LFOUnit containing the necessary source and gain nodes.
 */
export function createLFO(context: AudioContext, config: LFOConfig): LFOUnit {
	const lfoGain = context.createGain();
	lfoGain.gain.value = config.depth;

	let lfoSource: AudioNode;
	if (config.wave === 'perlin') {
		lfoSource = createPerlinLFO(context, config.rate);
	} else {
		const osc = context.createOscillator();
		osc.type = config.wave;
		osc.frequency.value = config.rate;
		lfoSource = osc;
	}

	return { source: lfoSource, gain: lfoGain };
}