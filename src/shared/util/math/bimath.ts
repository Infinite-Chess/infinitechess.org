// src/shared/util/math/bimath.ts

/**
 * This module contains complex math functions
 * for working with bigints.
 */

// Constants =========================================================

const ZERO: bigint = 0n;
const ONE: bigint = 1n;

// Mathematical Operations ===========================================

/**
 * Calculates the absolute value of a bigint
 * @param bigint - The BigInt
 * @returns The absolute value
 */
function abs(bigint: bigint): bigint {
	return bigint < ZERO ? -bigint : bigint;
}

/**
 * Estimates the number of base-10 digits in a bigint, excluding the sign.
 * Accurate most of the time. 100% of the time within 1 digit.
 * @param bigint - The BigInt to count digits for
 * @returns The number of base-10 digits (excluding sign)
 */
function countDigits(bigint: bigint): number {
	// Make it positive for digit counting
	const abs_bigint = abs(bigint);
	// Use bitLength for efficiency
	const bitLen = bitLength_bisection(abs_bigint);
	// Convert bit length to decimal digits: log10(2^bitLen) = bitLen * log10(2)
	// Use Math.floor and add 1 for high accuracy, sacrificing exactness.
	return Math.floor(bitLen * Math.log10(2)) + 1;
}

// Big Length Algorithms =============================================================

// Global state for the bisection algorithm so it's not re-computed every call
const testersCoeff: number[] = [];
const testersBigCoeff: bigint[] = [];
const testers: bigint[] = [];
let testersN = 0;

/**
 * Calculates the bit length of a bigint using a highly optimized dynamic bisection algorithm.
 * Complexity O(log n), where n is the number of bits.
 * Algorithm pulled from https://stackoverflow.com/a/76616288
 */
function bitLength_bisection(x: bigint): number {
	if (x === ZERO) return 0;
	if (x < ZERO) x = -x;

	let k = 0;
	while (true) {
		if (testersN === k) {
			testersCoeff.push(32 << testersN);
			testersBigCoeff.push(BigInt(testersCoeff[testersN]!));
			testers.push(1n << testersBigCoeff[testersN]!);
			testersN++;
		}
		if (x < testers[k]!) break;
		k++;
	}

	if (!k) return 32 - Math.clz32(Number(x));

	// Determine length by bisection
	k--;
	let i = testersCoeff[k]!;
	let a = x >> testersBigCoeff[k]!;
	while (k--) {
		const b = a >> testersBigCoeff[k]!;
		if (b) {
			i += testersCoeff[k]!;
			a = b;
		}
	}

	return i + 32 - Math.clz32(Number(a));
}

/**
 * Estimate the memory footprint of a BigInt in bytes, assuming a 64‑bit JavaScript engine
 * (e.g. V8 in Chrome/Node.js or JavaScriptCore in Safari).
 *
 * On a 64‑bit build, each BigInt is represented as a small heap object:
 * - Two pointer‑sized fields (object header)
 * - A sequence of 64‑bit “words” holding the integer’s bits, rounded up
 *
 * Total size = headerBytes + dataBytes
 * @param bi - The BigInt to measure.
 * @returns The estimated number of bytes occupied by the bigint in memory.
 */
function estimateBigIntSize(bi: bigint): number {
	// Compute bit length (number of binary digits)
	const bitLen = bitLength_bisection(bi);

	// In a 64‑bit engine, pointerSize = 8 bytes
	const pointerSize = 8;
	// Two pointers for the BigInt object header
	const headerBytes = pointerSize * 2;

	// Number of 64‑bit chunks needed to store the bits
	const chunkCount = Math.ceil(bitLen / (pointerSize * 8));
	const dataBytes = pointerSize * chunkCount;

	return headerBytes + dataBytes;
}

/**
 * Computes the positive modulus of two BigInts.
 * @param a - The dividend.
 * @param b - The divisor (must be a positive BigInt).
 * @returns The positive remainder of the division as a BigInt.
 */
function posMod(a: bigint, b: bigint): bigint {
	return ((a % b) + b) % b;
}

/** Finds the smaller of two BigInts. */
function min(a: bigint, b: bigint): bigint {
	return a < b ? a : b;
}

/** Finds the larger of two BigInts. */
function max(a: bigint, b: bigint): bigint {
	return a > b ? a : b;
}

/**
 * Compares two BigInts.
 * @param a The first BigInt.
 * @param b The second BigInt.
 * @returns -1 if a < b, 0 if a === b, and 1 if a > b.
 */
function compare(a: bigint, b: bigint): -1 | 0 | 1 {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Clamps a BigInt value between an inclusive minimum and maximum. */
function clamp(value: bigint, min: bigint, max: bigint): bigint {
	return value < min ? min : value > max ? max : value;
}

// Number-Theoretic Algorithms -----------------------------------------------------------------------------------------------

/**
 * Calculates the gcd of two bigints using the binary GCD (or Stein's) algorithm.
 * This is faster than the Euclidean algorithm, especially for very large numbers.
 */
function GCD(a: bigint, b: bigint): bigint {
	// We must work with positive numbers
	a = abs(a);
	b = abs(b);

	if (a === b) return a;
	if (a === ZERO) return b;
	if (b === ZERO) return a;

	// Strip out any shared factors of two beforehand (to be re-added at the end)
	let sharedTwoFactors = ZERO;
	while (!((a & ONE) | (b & ONE))) {
		sharedTwoFactors++;
		a >>= ONE;
		b >>= ONE;
	}

	while (a !== b && b > ONE) {
		// Any remaining factors of two in either number are not important to the gcd and can be shifted away
		while (!(a & ONE)) a >>= ONE;
		while (!(b & ONE)) b >>= ONE;

		// Standard Euclidean algorithm, maintaining a > b and avoiding division
		if (b > a) [a, b] = [b, a];
		else if (a === b) break;

		a -= b;
	}

	// b is the gcd, after re-applying the shared factors of 2 removed earlier
	return b << sharedTwoFactors;
}

// /**
//  * Calculates the least common multiple (LCM) between all BigInts in an array.
//  * @param array An array of BigInts.
//  * @returns The LCM of the numbers in the array.
//  */
// function LCM(array: bigint[]): bigint {
// 	if (array.length === 0)
// 		throw new Error('Array must contain at least one number to calculate the LCM.');

// 	let answer: bigint = array[0]!;
// 	for (let i = 1; i < array.length; i++) {
// 		const currentNumber = array[i]!;

// 		if (currentNumber === ZERO || answer === ZERO) answer = ZERO;
// 		else answer = abs(currentNumber * answer) / GCD(currentNumber, answer);
// 	}

// 	return answer;
// }

// Exports ============================================================

export default {
	// Mathematical Operations
	abs,
	countDigits,
	bitLength_bisection,
	// Big Length Algorithms
	estimateBigIntSize,
	posMod,
	min,
	max,
	compare,
	clamp,
	// Number-Theoretic Algorithms
	GCD,
};
