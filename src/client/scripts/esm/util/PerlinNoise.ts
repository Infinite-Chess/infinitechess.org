
/**
 * A factory for creating a tileable (periodic) 1D Perlin-style noise generator.
 */


/**
 * A pre-shuffled array of numbers from 0-255.
 * This is a standard permutation table used in many noise algorithms.
 * We double it to avoid needing extra modulo operations inside the noise function.
 */
const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
const perm = [...p, ...p];

/** A simple linear interpolation function. */
function lerp(a: number, b: number, t: number): number {
	return a + t * (b - a);
}

/** A smoothing function (quintic curve) to avoid artifacts in the noise. */
function fade(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Creates and returns a new 1D noise function that is periodic (tileable).
 * @param period The interval after which the noise pattern should repeat. Must be an integer.
 * @returns A function that takes a number `t` and returns a noise value between -1 and 1.
 */
// eslint-disable-next-line no-unused-vars
export function create1DNoiseGenerator(period: number): (t: number) => number {
	// Pre-calculate random gradients for the length of the period.
	// For 1D noise, a "gradient" is just a random number, either 1 or -1.
	const gradients = new Array(period);
	for (let i = 0; i < period; i++) {
		gradients[i] = (perm[i] % 2 === 0) ? 1 : -1;
	}

	return (t: number) => {
		// Find the integer grid points surrounding t
		const x0 = Math.floor(t);
		const x1 = x0 + 1;

		// Get the fractional part of t
		const t0 = t - x0;

		// This is the magic for making the noise tileable.
		// We use the modulo operator to wrap the grid coordinates around the period.
		// So, the gradient for point `period` will be the same as for point `0`.
		const g0 = gradients[x0 % period]!;
		const g1 = gradients[x1 % period]!;
		
		// Calculate the contribution of each gradient at point t
		const n0 = g0 * t0;
		const n1 = g1 * (t0 - 1);

		// Apply the fade curve to the fractional part for smooth interpolation
		const fadeT = fade(t0);

		// Interpolate between the two contributions and scale the output
		// to be consistently within the approximate range of -1 to 1.
		return lerp(n0, n1, fadeT) * 2.2;
	};
}


export default {
	create1DNoiseGenerator,
};