
// src/client/scripts/esm/util/bigdecimal/bimath.ts

/**
 * This module contains complex math functions
 * for working with bigints.
 */


// Constants =========================================================


// const LOG_TWO: number = Math.log(2);
const NEGONE: bigint = -1n;
const ZERO: bigint = 0n;
const ONE: bigint = 1n;
// const TWO: bigint = 2n;


// Mathematical Operations ===========================================


/**
 * Calculates the absolute value of a bigint
 * @param bigint - The BigInt
 * @returns The absolute value
 */
function abs(bigint: bigint): bigint {
	return bigint < ZERO ? -bigint : bigint;
}

// EVERYTHING COMMENTED OUT I AM UNSURE IF WE WILL NEED.

/** Calculates the integer logarithm base 2 of a BigInt. */
function log2(bigint: bigint): number {
	if (bigint === ZERO) return -Infinity; // Matches Math.log2(0)
	if (bigint < ZERO) return NaN;

	// The log base 2 is just the bit length - 1.
	// return bigint.toString(2).length - 1;
	// Our fastest bitLength algorithm.
	return bitLength_bisection(bigint) - 1;
}

/**
* Calculates the logarithm base 10 of the specified BigInt. Returns an integer.
* @param bigint - The BigInt. 0+
* @returns The logarithm to base 10
*/
function log10(bigint: bigint): number {
	if (bigint === ZERO) return -Infinity; // Matches Math.log2(0)
	if (bigint < ZERO) return NaN;

	return bigint.toString(10).length - 1;
}

// /**
//  * Calculates the logarithm of the specified base of the BigInt. Returns an integer.
//  * @param bigint - The BigInt. 0+
//  * @param base - The base of the logarithm
//  * @returns The logarithm to base N
//  */
// function logN(bigint: bigint, base: bigint): bigint {
//     if (bigint <= ZERO) throw new Error('logN is not defined for an input of 0 or less.');
//     if (base <= ONE) throw new Error('Logarithm base must be greater than 1.');

//     let result: bigint = ZERO;
//     let tempNumber: bigint = bigint;

//     while (tempNumber >= base) {
//         tempNumber /= base;
//         result++;
//     }

//     return result;
// }

// /**
//  * Returns the specified number of least significant.
//  * This can be used to extract only the decimal portion of a BigDecimal by passing in the divex number for the count.
//  * @param bigint - The BigInt
//  * @param count - The number of bits to get
//  * @returns A BigInt containing only the specified bits
//  */
// function getLeastSignificantBits(bigint: bigint, count: bigint): bigint {
//     if (count < ZERO) throw new Error('Count of bits cannot be negative.');

//     // Create a bitmask with the least significant n bits set to 1
//     let bitmask: bigint = (ONE << count) - ONE; // If count is 5, this looks like: 11111

//     // Apply bitwise AND operation with the bitmask to get the least significant bits
//     let leastSignificantBits: bigint = bigint & bitmask;

//     return leastSignificantBits;
// }

// /**
//  * Gets the bit at the specified position from the right. 1-based
//  * @param bigint - The BigInt
//  * @param position - The position from right. 1-based
//  * @returns 1 or 0
//  */
// function getBitAtPositionFromRight(bigint: bigint, position: number): 1 | 0 {
//     if (position < 1 || !Number.isInteger(position)) throw new Error(`Position must be a positive integer. Received: ${position}`);
    
//     // Create a mask where there is a single 1 at the position.
//     // For example, if our position is 5, the resulting bitmask is '10000'.
//     let bitmask: bigint = ONE << (BigInt(position) - ONE);
//     // Apply bitwise AND operation with the bitmask to test if this bit is a 1
//     const result: bigint = bigint & bitmask;
//     // If the result is greater than zero, we know the bit is a 1!
//     return result > ZERO ? 1 : 0;
// }

// /**
//  * OLD
//  *
//  * Returns the bigint in binary form, **exactly** like how computers store them,
//  * in two's complement notation. Negative values have all their bits flipped, and then added 1.
//  * To multiply by -1, reverse all the bits, and add 1. This works both ways.
//  * 
//  * For readability, if the number is negative, a space will be added after the leading '1' sign.
//  * @param bigint - The BigDecimal
//  * @returns The binary string. If it is negative, the leading `1` sign will have a space after it for readability.
//  */
// function getBinaryRepresentation(bigint: bigint): string {
//     if (bigint === ZERO) return '0';
//     const isNegative: boolean = bigint < ZERO;

//     let binaryString: string = '';

//     // This equation to calculate a bigint's bit-count, b = log_2(N) + 1, is snagged from:
//     // https://math.stackexchange.com/questions/1416606/how-to-find-the-amount-of-binary-digits-in-a-decimal-number/1416817#1416817
//     const bitCount: bigint = isNegative ? BigInt(log2(abs(bigint))) + TWO // Plus 2 to account for the sign bit
//                                         : BigInt(log2(bigint)) + ONE
//     // Alternate method to calculate the bit count that first converts the number to two's complement notation:
//     // const bitCount = bigint.toString(2).length;

//     // If the bit length is 5, the resulting mask would be '10000'
//     let mask: bigint = ONE << (bitCount - ONE);

//     while (mask !== ZERO) {
//         // Apphend the bit at the mask position to the string...
//         if ((bigint & mask) === ZERO) binaryString += '0';
//         else binaryString += '1';
//         mask >>= ONE;
//     }

//     // If the number is negative, insert a space between the leading sign and the rest, for readability.
//     if (isNegative) binaryString = binaryString[0] + ' ' + binaryString.slice(1)

//     return binaryString;
// }

/**
 * Returns a bigint's binary representation in an easy-to-read string format,
 * displaying all bits in the underlying 64‑bit chunks.
 */
function toDebugBinaryString(bigint: bigint): string {
	// 1. Handle the zero case cleanly.
	if (bigint === ZERO) return "0b_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000 (1-chunk, 8 bytes, 64 bits)";

	// 2. Calculate the minimum number of bits required for two's complement.
	let minBits: number;
	if (bigint > ZERO) {
		minBits = bitLength_bisection(bigint);
	} else { // bigint < ZERO
		// For a negative number -N, the bits required are one more than the bits
		// for N-1. e.g. -8 (1000) needs 4 bits, same as 7 (0111).
		// A simple, reliable way is to find the bit length of its positive counterpart and add 1 for the sign.
		// For -8, this becomes (-(-8n)) - 1n = 7n. The bit length of 7 (111) is 3. Add 1 for the sign bit = 4.
		// For -10, this is 9n. Bit length of 9 (1001) is 4. Add 1 for sign bit = 5.
		minBits = ((bigint * NEGONE) - ONE).toString(2).length + 1;
	}

	// Each chunk is 64 bits (8 bytes) on a 64-bit engine.
	const CHUNK_BITS = 64;
	const CHUNK_BYTES = CHUNK_BITS / 8;

	// 3. Determine how many 64-bit chunks we need, then total display bits
	const effectiveBits = bigint >= 0n
		? minBits + 1      // reserve sign-bit = 0
		: minBits;         // negatives still need exactly minBits
	const chunkCount = Math.ceil(effectiveBits / CHUNK_BITS);
	const displayBits = chunkCount * CHUNK_BITS;

	// 4. Calculate the two's complement value for this specific display width.
	const displayMask = (ONE << BigInt(displayBits)) - ONE;
	const displayValue = bigint & displayMask;

	// 5. Convert to a binary string and pad with leading zeros.
	const binaryString = displayValue.toString(2).padStart(displayBits, '0');

	// 6. Add separators for readability (e.g., "1111_0110").
	let formattedString = "0b";
	for (let i = 0; i < binaryString.length; i++) {
		if (i > 0 && i % 4 === 0) formattedString += "_";
		formattedString += binaryString[i];
	}

	// 7. Add a helpful annotation with chunk count, bytes, and bits.
	const annotation = `(${chunkCount}-chunk, ${chunkCount * CHUNK_BYTES} bytes, ${displayBits} bits)`;

	return `${formattedString} ${annotation}`;
}



// Big Length Algorithms =============================================================


// Global state for the bisection algorithm so it's not re-computed every call
const testersCoeff: number[] = [];
const testersBigCoeff: bigint[] = [];
const testers: bigint[] = [];
let testersN = 0;

/**
 * Calculates the bit length of a bigint using a highly optimized dynamic bisection algorithm.
 * It is 6x faster than then {@link bitLength_hex}, and 25x faster than {@link bitLength_toString}.
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
 * Calculates the bit length of a bigint using a fast `toString(16)` and `Math.clz32` trick.
 * It is 4x faster than {@link bitLength_toString}.
 */
function bitLength_hex(n: bigint): number {
	if (n === ZERO) return 0;
	if (n < ZERO) n = -n;

	const hexLength = n.toString(16).length;
	const i = (hexLength - 1) * 4;
	return i + (32 - Math.clz32(Number(n >> BigInt(i))));
}


/**
 * Calculates the bit length of a bigint using the simple `toString(2)` method.
 * This is the most readable but least performant method.
 */
function bitLength_toString(n: bigint): number {
	if (n === ZERO) return 0;
	if (n < ZERO) n = -n;
	return n.toString(2).length;
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
 * @returns The estimated number of bytes occupied by `value` in memory.
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
	return (a % b + b) % b;
}

/** Finds the larger of two BigInts. */
function max(a: bigint, b: bigint): bigint {
	return a > b ? a : b;
}

/** Finds the smaller of two BigInts. */
function min(a: bigint, b: bigint): bigint {
	return a < b ? a : b;
}


// Number-Theoretic Algorithms -----------------------------------------------------------------------------------------------


/**
 * Computes the greatest common divisor (GCD) of two BigInts using the Euclidean algorithm.
 * @param a The first BigInt.
 * @param b The second BigInt.
 * @returns The non-negative GCD of a and b.
 */
function GCD(a: bigint, b: bigint): bigint {
	while (b !== ZERO) {
		[a, b] = [b, a % b];
	}
	return abs(a);
}

/**
 * Calculates the least common multiple (LCM) between all BigInts in an array.
 * @param array An array of BigInts.
 * @returns The LCM of the numbers in the array.
 */
function LCM(array: bigint[]): bigint {
	if (array.length === 0) throw new Error('Array must contain at least one number to calculate the LCM.');

	let answer: bigint = array[0]!;
	for (let i = 1; i < array.length; i++) {
		const currentNumber = array[i]!;

		// A single-line if/else statement without curly braces.
		if (currentNumber === ZERO || answer === ZERO) answer = ZERO;
		else answer = abs(currentNumber * answer) / GCD(currentNumber, answer);
	}

	return answer;
}


// Exports ============================================================


export default {
	abs,
	log2,
	log10,
	// logN,
	// getLeastSignificantBits,
	// getBitAtPositionFromRight,
	toDebugBinaryString,
	bitLength_bisection,
	estimateBigIntSize,
	posMod,
	max,
	min,
	GCD,
	LCM,
};