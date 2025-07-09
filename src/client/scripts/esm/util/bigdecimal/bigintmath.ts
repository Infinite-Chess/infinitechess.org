
// src/client/scripts/esm/util/bigdecimal/bigintmath.ts

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

/**
 * Calculate the logarithm base 2 of the specified BigInt. Returns an integer.
 * @param bigint - The BigInt. 0+
 * @returns The logarithm to base 2
 */
function log2(bigint: bigint): number {
	if (bigint === ZERO) return -Infinity; // Matches Math.log2(0)
	if (bigint < ZERO) return NaN;
    
	return bigint.toString(2).length - 1;
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
 * NEW FUNCTION WITH HELP OF GEMINI
 * 
 * Returns a bigint's binary representation in a standardized, debug-friendly format.
 * - It correctly displays negative numbers using two's complement.
 * - It automatically calculates the necessary bit-width and pads it to the nearest byte (8 bits).
 * - It adds separators for readability and an annotation for context.
 * This is the recommended method for reliably inspecting the bits of any bigint.
 *
 * @param bigint The bigint to inspect.
 * @returns A formatted binary string ideal for debugging.
 */
function toDebugBinaryString(bigint: bigint): string {
	// 1. Handle the zero case cleanly.
	if (bigint === 0n) return "0b0000_0000 (8-bit, 1-byte)";

	// 2. Calculate the minimum number of bits required for two's complement.
	let minBits: number;
	if (bigint > ZERO) {
		minBits = bigint.toString(2).length;
	} else { // bigint < ZERO
		// For a negative number -N, the bits required are one more than the bits
		// for N-1. e.g. -8 (1000) needs 4 bits, same as 7 (0111).
		// A simple, reliable way is to find the bit length of its positive counterpart and add 1 for the sign.
		// For -8, this becomes (-(-8n)) - 1n = 7n. The bit length of 7 (111) is 3. Add 1 for the sign bit = 4.
		// For -10, this is 9n. Bit length of 9 (1001) is 4. Add 1 for sign bit = 5.
		minBits = ((bigint * NEGONE) - ONE).toString(2).length + 1;
	}

	// 3. Round up the bit-width to the nearest multiple of 8 (a full byte).
	// This gives us a standard, padded view (8-bit, 16-bit, 24-bit, etc.).
	const displayBits = Math.ceil(minBits / 8) * 8;

	// 4. Calculate the two's complement value for this specific display width.
	const displayMask = (ONE << BigInt(displayBits)) - ONE;
	const displayValue = bigint & displayMask; // This handles both positive and negative correctly

	// 5. Convert to a binary string and pad with leading zeros.
	const binaryString = displayValue.toString(2).padStart(displayBits, '0');

	// 6. Add separators for readability (e.g., "1111_0110" instead of "11110110").
	let formattedString = "0b";
	for (let i = 0; i < binaryString.length; i++) {
		if (i > 0 && i % 4 === 0) formattedString += "_";
		formattedString += binaryString[i];
	}
    
	// 7. Add a helpful annotation.
	const annotation = `(${displayBits}-bit, ${displayBits / 8}-byte)`;
    
	// Pad the string so annotations align in console logs
	// return `${formattedString.padEnd(10 + displayBits + Math.floor(displayBits/4))}${annotation}`;
	return `${formattedString} ${annotation}`;
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
};