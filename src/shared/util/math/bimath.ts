// src/shared/util/math/bimath.ts

/**
 * This module contains complex math functions
 * for working with bigints.
 */

// Constants -------------------------------------------------------------------

const ZERO: bigint = 0n;
const ONE: bigint = 1n;

const LOG10_2 = Math.log10(2); // 0.3010299956639812

// Mathematical Operations -----------------------------------------------------

/** Calculates the absolute value of a bigint. */
function abs(bigint: bigint): bigint {
	return bigint < ZERO ? -bigint : bigint;
}

/**
 * Estimates the number of base-10 digits in a bigint, excluding the sign.
 * Accurate most of the time. 100% of the time within 1 digit.
 */
function countDigits(bigint: bigint): number {
	// Make it positive for digit counting
	const abs_bigint = abs(bigint);
	// Use bitLength for efficiency
	const bitLen = bitLength_bisection(abs_bigint);
	// Convert bit length to decimal digits: log10(2^bitLen) = bitLen * log10(2)
	// Use Math.floor and add 1 for high accuracy, sacrificing exactness.
	return Math.floor(bitLen * LOG10_2) + 1;
}

/** Computes the positive modulus of two BigInts. `b` must be positive. */
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

/** Compares two BigInts: -1 if a < b, 0 if a === b, and 1 if a > b. */
function compare(a: bigint, b: bigint): -1 | 0 | 1 {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Clamps a BigInt value between an inclusive minimum and maximum. */
function clamp(value: bigint, low: bigint, high: bigint): bigint {
	return value < low ? low : value > high ? high : value;
}

// Bit Length Algorithms -------------------------------------------------------

// Lazily grown lookup tables for the bisection algorithm, so each rung of
// powers-of-two is computed once across all calls instead of every call.
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

// Number-Theoretic Algorithms -------------------------------------------------

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

// Display Formatting ----------------------------------------------------------

/**
 * Formats a bigint in scientific notation with the given number of significant figures.
 * e.g. formatBigIntExponential(123456789n, 3) => "1.23e8".
 * Optimized for massive bigints to avoid O(N^2) base-10 string conversion bottlenecks.
 */
function formatBigIntExponential(bigint: bigint, precision: number): string {
	if (precision < 1 || precision > 15)
		throw new Error('Precision must be between 1 and 15 significant figures.');
	const absVal = abs(bigint);
	const bitLen = bitLength_bisection(absVal);

	let exponent: number;
	let str: string;

	if (bitLen <= 53) {
		// Fast path for numbers that safely fit within JavaScript's Number bounds (up to 53 bits).
		// Calling .toString() on small bigints is virtually instantaneous and handles ZERO gracefully.
		str = absVal.toString();
		exponent = str.length - 1;
	} else {
		// O(1) Fast Math Path for Massive BigInts
		// V8 BigInt.toString(10) is heavily O(N^2) and stalls the game thread.
		// We instead extract the top 53 bits and use floating-point math.

		// shiftNum is the exponent of base 2 we are throwing away
		const shiftNum = bitLen - 53;
		const topBits = Number(absVal >> BigInt(shiftNum));

		// Mathematically: Value = topBits * 2^shift
		// log10(Value) = log10(topBits) + shift * log10(2)
		const log10 = Math.log10(topBits) + shiftNum * LOG10_2;

		exponent = Math.floor(log10);

		// mantissaFloat is strictly between 1.0 and 9.999...
		// We use (log10_val - exponent) which is always in range [0, 1) to avoid Math.pow overflow
		let mantissaFloat = Math.pow(10, log10 - exponent);

		// Render to 15 significant figures (a double's full reliable precision).
		let mStr = mantissaFloat.toFixed(14);

		// If rounding pushed the float up to 10 (e.g. 9.99999999999), carry over exponent
		if (mStr.startsWith('10.')) {
			mantissaFloat /= 10;
			exponent += 1;
			mStr = mantissaFloat.toFixed(14);
		}

		str = mStr.replace('.', '');
	}

	// Cleanly apply truncation and decimal placement
	const isNegative = bigint < ZERO;
	const digits = str.substring(0, precision);
	const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;

	return `${isNegative ? '-' : ''}${mantissa}e${exponent}`;
}

// Exports ---------------------------------------------------------------------

export default {
	// Mathematical Operations
	abs,
	countDigits,
	posMod,
	min,
	max,
	compare,
	clamp,
	// Bit Length Algorithms
	bitLength_bisection,
	estimateBigIntSize,
	// Number-Theoretic Algorithms
	GCD,
	// Display Formatting
	formatBigIntExponential,
};
