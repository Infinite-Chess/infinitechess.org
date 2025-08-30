
// src/client/scripts/esm/util/bigdecimal/bigdecimal.ts

/**
 * High performance arbitrary-precision decimal type of Javascript.
 * https://github.com/Naviary2/BigDecimal
 * 
 * Use Big Decimals when you not only need the arbitrary size of BigInts,
 * but also decimals to go with them!
 * 
 * It is in base 2, so most base-10 numbers can't be represented perfectly.
 * 
 * ================ HOW IT WORKS ================
 * 
 * Javascript's BigInt primitive is one of the fastest methods for performing
 * arbitrary integer arithmetic in javascript. This library takes advantage of
 * BigInt's speed, and combines it with fixed-point arithmetic. A set portion
 * of the least-significant bits of the BigInt are dedicated towards the decimal
 * portion of the number, indicated by the divex property, and the remaining
 * most-significant bits are used for the integer portion!
 * 
 * The value of a BigDecimal is always `bigint / (2^divex)`.
 * 
 * If we wanted to store 2.75, that would look like { bigint: 11n, divex: 2}.
 * In binary, 11n is 1011. But the right-most 2 bits are dedicated for the decimal
 * part, so we split it into 10, which is 2 in binary, and 11, which is a binary
 * fraction for 0.75. Added together we get 2.75.
 * 
 * This allows us to work with arbitrary-sized numbers with arbitrary levels of decimal precision!
 */


import bimath from './bimath.js';

import type { BDCoords, Coords, DoubleCoords } from '../../chess/util/coordutil.js';


// Types ========================================================


/** 
 * The main Big Decimal type. Capable of storing arbitrarily large numbers,
 * with arbitrary levels of decimal precision!
 */
interface BigDecimal {
	/**
	 * The bigint storing the bits of the BigDecimal. Multiply this
	 * by 2^(-divex) to get the true number being stored by the Big Decimal!
	 */
    bigint: bigint,
	/**
	 * The inverse (or negative) exponent. Directly represents how many bits of the
	 * bigint are utilized to store the decimal portion of the Big Decimal,
	 * or tells you what position the decimal point is at from the right.
	 * A negative divex represents a positive exponent (a large number).
	 */
    divex: number,
}


// Constants ========================================================


const LOG10_OF_2: number = Math.log10(2); // ≈ 0.30103

const ZERO: bigint = 0n;
const ONE: bigint = 1n;
const FIVE: bigint = 5n;
const TEN: bigint = 10n;


// Config ===========================================================


/**
 * The default additional number of bits used as working precision
 * for all Big Decimals, on top of the minimum precision needed for
 * the true value to round to the desired value.
 * 
 * The minimum number of bits used to store decimal bits in BigDecimals.
 * Without working precision, small numbers parsed into BigDecimals would lose some precision.
 * For example, 3.1 divex 4 ==> 3.125. Now even though 3.125 DOES round to 3.1,
 * it means we'll very quickly lose a lot of accuracy when performing arithmetic!
 * The user expects that, when they pass in 3.1, the resulting BigDecimal should be AS CLOSE to 3.1 as possible!!
 * With a DEFAULT_WORKING_PRECISION of 50 bits, 3.1 divex 50 ==> 3.10000000000000142, which is A LOT closer to 3.1!
 * I arbitrarily chose 50 bits for the minimum, because that gives us about 15 digits of precision,
 * which is about how much javascript's doubles give us.
 */
const DEFAULT_WORKING_PRECISION = 23; // Default: 53 (matches javascript's double precision)   23: float32 precision

/**
 * The maximum divex a BigDecimal is allowed to have.
 * Beyond this, the divex is assumed to be running away towards Infinity, so an error is thrown.
 * Can be adjusted if you want more maximum precision.
 */
const MAX_DIVEX = 1e5; // Default: 1e3 (100,000)

/** A list of powers of 2, 1024 in length, starting at 1 and stopping before Number.MAX_VALUE. This goes up to 2^1023. */
const powersOfTwoList: number[] = (() => {
	const powersOfTwo: number[] = [];
	let currentPower = 1;
	while (currentPower < Number.MAX_VALUE) {
		powersOfTwo.push(currentPower);
		currentPower *= 2;
	}
	return powersOfTwo;
})();

/**
 * Any divex greater than 1023 can lead to Number casts (of the decimal portion)
 * greater than Number.MAX_VALUE or equal to Infinity, because 1 * 2^1024 === Infinity,
 * but 1 * 2^1023 does NOT. And 1.0 encompasses all possible fractional values!
 * BigDecimals with divexs THAT big need special care!
 */
const MAX_DIVEX_BEFORE_INFINITY: number = powersOfTwoList.length - 1; // 1023


// Helpers ====================================================================


/**
 * Returns the specified bigint power of 2 when called.
 * This has a dynamic internal list that, when a power of 2 is requested that is does not have,
 * it will calculate more powers of 2 up to the requested power!
 * @param power - The power of 2 to retrieve
 * @returns The bigint power of 2 requested
 */
const getBigintPowerOfTwo: (power: number) => bigint = (function() {

	// Initiate the list
	const powersOfTwo: bigint[] = [];
	let currentPower: bigint = ONE;
	const MAX_VALUE: bigint = BigInt(Number.MAX_VALUE);
	while (currentPower < MAX_VALUE) {
		powersOfTwo.push(currentPower);
		currentPower <<= ONE;
	}

	// Adds more powers of 2 until we reach the provided power
	function addMorePowers(powerCap: number): void {
		console.log(`Adding more bigint powers of 2, up to 2^${powerCap}!`);
		for (let i = powersOfTwo.length - 1; i <= powerCap - 1; i++) {
			const thisPower = powersOfTwo[i]!;
			powersOfTwo[i + 1] = thisPower << ONE;
		}
	}

	// Return a function that, when called, returns the specified power of 2
	return (power: number): bigint => {
		// Do we have enough powers of two in store?
		if (power > powersOfTwo.length - 1) addMorePowers(power);
		return powersOfTwo[power]!;
	};
})();


// Big Decimal Contructor =============================================================


/**
 * Creates a Big Decimal from a string (arbitrarily long)
 * "1905000302050000000000000000000000000000000000.567"
 * The final precision is calculated dynamically to preserve the input string's
 * precision, plus a "working precision" for future calculations.
 * @param num The string to convert.
 * @param [workingPrecision=DEFAULT_WORKING_PRECISION] The amount of extra precision to add.
 * @returns A new BigDecimal with the value from the string.
 */
function NewBigDecimal_FromString(num: string, workingPrecision: number = DEFAULT_WORKING_PRECISION): BigDecimal {
	if (workingPrecision < 0 || workingPrecision > MAX_DIVEX) throw new Error(`Precision must be between 0 and ${MAX_DIVEX}. Received: ${workingPrecision}`);

	// 1. Validate and deconstruct the string using regex.
	const match = num.trim().match(/^(-?)(\d*)?\.?(\d*)$/);
	if (!match) throw new Error("Invalid number format");
	const sign = match[1] || '';
	const intPart = match[2] || '0';
	const fracPart = match[3] || '';
	
	const decimalDigitCount = fracPart.length;

	// Combine parts into a single integer string (e.g., "-1.23" -> "-123")
	const numAsIntegerString = sign + intPart + fracPart;
	let numberAsBigInt = BigInt(numAsIntegerString);
	
	// 2. Calculate the minimum bits needed to represent the input string's fractional part.
	const minBitsForInput: number = howManyBitsForDigitsOfPrecision(decimalDigitCount);

	// 3. The final divex is this minimum, plus the requested "working precision".
	//    This ensures we always have enough precision for the input, plus a buffer for future math.
	const divex: number = minBitsForInput + workingPrecision;
	// Check if the calculated divex is within our library's limits.
	if (divex > MAX_DIVEX) throw new Error(`Precision after applying working precision exceeded ${MAX_DIVEX}. Please use an input number with fewer decimal places or specify less working precision.`);

	// 4. Calculate 5^N.
	const powerOfFive: bigint = FIVE ** BigInt(decimalDigitCount);

	const shiftAmount = BigInt(divex - decimalDigitCount);
	if (shiftAmount > 0) numberAsBigInt <<= shiftAmount;
	else if (shiftAmount < 0) numberAsBigInt >>= -shiftAmount; // A negative shift is a right shift.

	// 5. Finally, perform the division by the power of 5, with rounding.
	//    We add half the divisor before dividing to implement "round half up".
	const halfDivisor = powerOfFive / 2n;
	const bigint: bigint = (numberAsBigInt + halfDivisor) / powerOfFive;
    
	return {
		bigint,
		divex,
	};
}

/**
 * Creates a Big Decimal from a javascript number (double) by directly
 * interpreting its IEEE 754 binary representation extremely fast.
 * WARNING: If the input number is too small, and you don't specify a high enough precision,
 * then the resulting BigDecimal becomes 0! The precision is not automatic here.
 * @param num - The number to convert.
 * @param [precision=DEFAULT_WORKING_PRECISION] The target divex for the result.
 * @returns A new BigDecimal with the value from the number.
 */
function FromNumber(num: number, precision: number = DEFAULT_WORKING_PRECISION): BigDecimal {
	if (precision < 0 || precision > MAX_DIVEX) throw new Error(`Precision must be between 0 and ${MAX_DIVEX}. Received: ${precision}`);
    
	// 1. Handle non-finite and zero cases first.
	if (!isFinite(num)) throw new Error(`Cannot create a BigDecimal from a non-finite number. Received: ${num}`);
	if (num === 0) return { bigint: ZERO, divex: precision };


	// 2. Extract the raw 64 bits of the float into a BigInt.
	// This is a standard and fast technique to get the binary components.
	const buffer = new ArrayBuffer(8);
	const floatView = new Float64Array(buffer);
	const intView = new BigInt64Array(buffer);
	floatView[0] = num;
	const bits = intView[0]!;

	// 3. Parse the sign, exponent, and mantissa from the bits.
	const sign = (bits < ZERO) ? -ONE : ONE;
	const exponent = Number((bits >> 52n) & 0x7FFn);
	const mantissa = bits & 0xFFFFFFFFFFFFFn;

	let initialBigInt: bigint;
	let initialDivex: number;

	if (exponent === 0) {
		// Subnormal number. The implicit leading bit is 0.
		// The effective exponent is -1022, and we scale by the mantissa bits (52).
		initialBigInt = sign * mantissa;
		initialDivex = 1022 + 52; // 1074
	} else {
		// Normal number. The implicit leading bit is 1.
		// Add the implicit leading bit to the mantissa to get the full significand.
		const significand = (ONE << 52n) | mantissa;
		initialBigInt = sign * significand;
		// The exponent is biased by 1023. We also account for the 52 fractional
		// bits in the significand to get the final scaling factor.
		initialDivex = 1023 - exponent + 52;
	}
    
	// 4. Adjust the precision to match the user's request.
	// This is identical to the logic in `setExponent`.
	const difference = initialDivex - precision;

	if (difference === 0) {
		// Precision already matches.
		return { bigint: initialBigInt, divex: initialDivex };
	} else if (difference < 0) {
		// We are increasing precision (shifting left).
		return {
			bigint: initialBigInt << BigInt(-difference),
			divex: precision,
		};
	} else {
		// We are decreasing precision (shifting right), so we must round.
		const half = ONE << BigInt(difference - 1);
		return {
			bigint: (initialBigInt + half) >> BigInt(difference),
			divex: precision
		};
	}
}

/**
 * Creates a Big Decimal from a bigint and a desired precision level.
 * @param num
 * @param [precision=DEFAULT_WORKING_PRECISION] The amount of extra precision to add.
 * @returns A new BigDecimal with the value from the bigint.
 */
function FromBigInt(num: bigint, precision: number = DEFAULT_WORKING_PRECISION): BigDecimal {
	if (precision < 0 || precision > MAX_DIVEX) throw new Error(`Precision must be between 0 and ${MAX_DIVEX}. Received: ${precision}`);
	return {
		bigint: num << BigInt(precision),
		divex: precision,
	};
}

/**
 * Converts Coords to BDCoords (BigDecimal), capable of decimal arithmetic.
 * @param coords
 * @param [precision=DEFAULT_WORKING_PRECISION] The amount of extra precision to add.
 * @returns New BDCoords with the values from the coords.
 */
function FromCoords(coords: Coords, precision: number = DEFAULT_WORKING_PRECISION): BDCoords {
	if (precision < 0 || precision > MAX_DIVEX) throw new Error(`Precision must be between 0 and ${MAX_DIVEX}. Received: ${precision}`);
	return [
		FromBigInt(coords[0], precision),
		FromBigInt(coords[1], precision),
	];
}

/** Converts coordinates of javascript doubles to BDCoords (BigDecimal) */
function FromDoubleCoords(coords: DoubleCoords, precision: number = DEFAULT_WORKING_PRECISION): BDCoords {
	if (precision < 0 || precision > MAX_DIVEX) throw new Error(`Precision must be between 0 and ${MAX_DIVEX}. Received: ${precision}`);
	return [
		FromNumber(coords[0], precision),
		FromNumber(coords[1], precision),
	];
}


// Helpers ===========================================================================================


// UNUSED NOW since the constructor from number no longer intermediately converts to a string?
// /**
//  * Converts a finite number to a string in full decimal notation, avoiding scientific notation.
//  * This method is reliable for all finite numbers, correctly handling all edge cases.
//  * @param num The number to convert.
//  * @returns The number in decimal format as a string.
//  */
// function toFullDecimalString(num: number): string {
// 	// 1. Input Validation: Fail fast for non-finite numbers.
// 	if (!isFinite(num)) throw new Error(`Cannot decimal-stringify a non-finite number. Received: ${num}`);

// 	// 2. Optimization: Handle numbers that don't need conversion.
// 	const numStr: string = String(num);
// 	if (!numStr.includes('e')) return numStr;

// 	// 3. Deconstruct the scientific notation string.
// 	const [base, exponentStr] = numStr.split('e') as [string, string];
// 	const exponent: number = Number(exponentStr);
// 	const sign: string = base[0] === '-' ? '-' : '';
// 	const absBase: string = base.replace('-', '');
// 	const [intPart, fracPart = ''] = absBase.split('.') as [string, string];

// 	// 4. Reconstruct the string based on the exponent.
// 	if (exponent > 0) { // For large numbers
// 		if (exponent >= fracPart.length) {
// 			// Case A: The decimal point moves past all fractional digits.
// 			// e.g., 1.23e5 -> 123000
// 			const allDigits = intPart + fracPart;
// 			const zerosToPad = exponent - fracPart.length;
// 			return sign + allDigits + '0'.repeat(zerosToPad);
// 		} else {
// 			// Case B: The decimal point lands within the fractional digits.
// 			// e.g., 1.2345e2 -> 123.45
// 			const decimalIndex = intPart.length + exponent;
// 			const allDigits = intPart + fracPart;
// 			const left = allDigits.slice(0, decimalIndex);
// 			const right = allDigits.slice(decimalIndex);
// 			return sign + left + '.' + right;
// 		}
// 	} else { // For small numbers (exponent < 0)
// 		const numLeadingZeros = -exponent - 1;
// 		const allDigits = intPart + fracPart;
// 		return sign + '0.' + '0'.repeat(numLeadingZeros) + allDigits;
// 	}
// }

/**
 * Returns the mimimum number of bits you need to get the specified digits of precision, rounding up.
 * 1 decimal digit of precision ≈ 3.32 binary bits of precision.
 * 
 * For example, to have 3 decimal places of precision in a BigDecimal, or precision to the nearest thousandth,
 * call this function with precision `3`, and it will return `10` to use for the divex value of your BigDecimal, because 2^10 ≈ 1000
 * 
 * HOWEVER, it is recommended to add some constant amount of extra precision to retain accuracy!
 * 3.1 divex 4 ==> 3.125. Now even though 3.125 DOES round to 3.1,
 * performing our arithmetic with 3.125 will quickly divexiate inaccuracies!
 * If we added 30 extra bits of precision, then our 4 bits of precision
 * becomes 34 bits. 3.1 divex 34 ==> 3.099999999976717... which is a LOT closer to 3.1!
 * @param precision - The number of decimal places of precision you would like
 * @returns The minimum number of bits needed to obtain that precision, rounded up.
 */
function howManyBitsForDigitsOfPrecision(precision: number): number {
	if (precision === 0) return 0; // No bits needed for zero precision.
	// Use bigints so that in-between values don't become Infinity.
	const powerOfTen: bigint = TEN ** BigInt(precision); // 3 ==> 1000n
	// 2^x = powerOfTen. Solve for x
	return bimath.log2(powerOfTen) + 1; // +1 to round up
}


// Math and Arithmetic Methods ==================================================================

/**
 * Adds two BigDecimal numbers.
 * The resulting BigDecimal will have a divex equal to the first argument.
 * If the second argument has a higher divex, it will be rounded before addition.
 * @param bd1 - The first addend, which also determines the result's precision.
 * @param bd2 - The second addend.
 * @returns The sum of bd1 and bd2.
 */
function add(bd1: BigDecimal, bd2: BigDecimal): BigDecimal {
	// To add, both BigDecimals must have the same divex (common denominator).
	// We'll scale the one with the lower divex up to match the higher one.

	if (bd1.divex === bd2.divex) {
		// Exponents are the same, a simple bigint addition is sufficient.
		return {
			bigint: bd1.bigint + bd2.bigint,
			divex: bd1.divex
		};
	} else if (bd1.divex > bd2.divex) {
		// Scale up bd2 to match bd1's divex
		const bd2DivexAdjusted = bd2.bigint << BigInt(bd1.divex - bd2.divex);
		return {
			bigint: bd1.bigint + bd2DivexAdjusted,
			divex: bd1.divex
		};
	} else { // divex2 > divex1
		// bd2 has more precision. We must scale it DOWN to match bd1, which requires rounding.
		const difference = BigInt(bd2.divex - bd1.divex);

		// To "round half up", we add 0.5 before truncating (right-shifting).
		// "0.5" at the correct scale is 1 bit shifted by (difference - 1).
		const half = ONE << (difference - ONE);

		// Round bd2's bigint to the precision of bd1
		const roundedBd2BigInt = (bd2.bigint + half) >> difference;

		return {
			bigint: bd1.bigint + roundedBd2BigInt,
			divex: bd1.divex
		};
	}
}

/**
 * Subtracts the second BigDecimal from the first.
 * The resulting BigDecimal will have a divex equal to the first argument (the minuend).
 * If the second argument has a higher divex, it will be rounded before subtraction.
 * @param bd1 - The minuend, which also determines the result's precision.
 * @param bd2 - The subtrahend.
 * @returns The difference of bd1 and bd2 (bd1 - bd2).
 */
function subtract(bd1: BigDecimal, bd2: BigDecimal): BigDecimal {
	// To subtract, both BigDecimals must have the same divex (common denominator).
	// We scale the one with the lower divex up to match the higher one.

	if (bd1.divex === bd2.divex) {
		// Exponents are the same, a simple bigint subtraction is sufficient.
		return {
			bigint: bd1.bigint - bd2.bigint,
			divex: bd1.divex
		};
	} else if (bd1.divex > bd2.divex) {
		// Scale up bd2's bigint to match bd1's divex
		const bd2BigIntAdjusted = bd2.bigint << BigInt(bd1.divex - bd2.divex);
		return {
			bigint: bd1.bigint - bd2BigIntAdjusted,
			divex: bd1.divex
		};
	} else { // bd2.divex > bd1.divex
		// bd2 has more precision. We must scale it DOWN to match bd1, which requires rounding.
		const difference = BigInt(bd2.divex - bd1.divex);

		// Use the same "round half up towards positive infinity" logic as in add().
		const half = ONE << (difference - 1n);

		// Round bd2's bigint to the precision of bd1.
		const roundedBd2BigInt = (bd2.bigint + half) >> difference;

		return {
			bigint: bd1.bigint - roundedBd2BigInt,
			divex: bd1.divex,
		};
	}
}

/**
 * [Fixed-Point Model] Multiplies two BigDecimal numbers.
 * The resulting BigDecimal will have a divex equal to the first factor.
 * This provides a balance of precision and predictable behavior.
 * @param bd1 The first factor.
 * @param bd2 The second factor.
 * @returns The product of bd1 and bd2, with the same precision as the first factor.
 */
function multiply_fixed(bd1: BigDecimal, bd2: BigDecimal): BigDecimal {
	// The true divex of the raw product is (bd1.divex + bd2.divex).
	// We must shift the raw product to scale it to the targetDivex (bd1.divex).
	// The total shift is therefore equal to bd2.divex.
	const shiftAmount = BigInt(bd2.divex);

	// First, get the raw product of the internal bigints.
	const rawProduct = bd1.bigint * bd2.bigint;
	let product: bigint;

	if (shiftAmount > ZERO) {
		// Case 1: shiftAmount is positive.
		// We are decreasing precision (e.g., multiplying by 0.5), so we must right-shift and round.
		const half = ONE << (shiftAmount - ONE);
		product = (rawProduct + half) >> shiftAmount;
	} else if (shiftAmount < ZERO) {
		// Case 2: shiftAmount is negative.
		// We are increasing precision (e.g., multiplying by a large number), so we must left-shift.
		// The shift amount must be positive, so we use -shiftAmount.
		// No rounding is needed as we are not losing bits.
		product = rawProduct << -shiftAmount;
	} else {
		// Case 3: shiftAmount is zero.
		// No scaling is needed.
		product = rawProduct;
	}

	return {
		bigint: product,
		divex: bd1.divex,
	};
}

/**
 * [Floating-Point Model] Multiplies two BigDecimals, preserving significant digits.
 * The divex may grow, but it shouldn't grow uncontrollably.
 * @param bd1 The first factor.
 * @param bd2 The second factor.
 * @param mantissaBits - How many bits of mantissa to use for the result, while still guaranteeing arbitrary integer precision. This only affects really small decimals. If not provided, the default will be used.
 * @returns The product of bd1 and bd2.
 */
function multiply_floating(bd1: BigDecimal, bd2: BigDecimal, mantissaBits?: number): BigDecimal {
	// 1. Calculate the raw product of the internal bigints.
	const newBigInt = bd1.bigint * bd2.bigint;
    
	// 2. The new scale is the sum of the original scales.
	const newDivex = bd1.divex + bd2.divex;
    
	// 3. Immediately hand off to normalize to enforce the floating-point model.
	return normalize({ bigint: newBigInt, divex: newDivex }, mantissaBits);
}

/**
 * [Fixed-Point Model] Divides the first BigDecimal by the second, producing a result with a predictable divex.
 * The result divex will be equal to the dividend's divex.
 * This prevents the divex from growing uncontrollably with repeated divisions.
 * @param bd1 - The dividend.
 * @param bd2 - The divisor.
 * @param [workingPrecision=DEFAULT_WORKING_PRECISION] - Extra bits for internal calculation to prevent rounding errors.
 * @returns The quotient of bd1 and bd2 (bd1 / bd2), with the same precision as the dividend.
 */
function divide_fixed(bd1: BigDecimal, bd2: BigDecimal, workingPrecision: number = DEFAULT_WORKING_PRECISION): BigDecimal {
	if (bd2.bigint === ZERO) throw new Error("Division by zero is not allowed.");

	// 1. Calculate the total shift needed for the dividend. This includes:
	//    - The extra "workingPrecision" to ensure accuracy during division.
	const shift = BigInt(bd2.divex + workingPrecision);

	// 2. Scale the dividend up.
	const scaledDividend = bd1.bigint << shift;

	// 3. Perform the integer division. The result has `workingPrecision` extra bits.
	const quotient = scaledDividend / bd2.bigint;
	
	// 4. Round the result by shifting it back down by `workingPrecision`.
	//    We add "0.5" before truncating to round half towards positive infinity.
	const workingPrecisionBigInt = BigInt(workingPrecision);
	if (workingPrecisionBigInt <= ZERO) return {
		bigint: quotient,
		divex: bd1.divex
	};
	const half = ONE << (workingPrecisionBigInt - ONE);
	const finalQuotient = (quotient + half) >> workingPrecisionBigInt;

	return {
		bigint: finalQuotient,
		divex: bd1.divex
	};
}

/**
 * [Floating-Point Model] Divides two BigDecimals, preserving significant digits.
 * This method dynamically calculates the required internal precision to ensure the result
 * never truncates to zero unless the dividend is zero.
 * @param bd1 - The dividend.
 * @param bd2 - The divisor.
 * @param [mantissaBits=DEFAULT_MANTISSA_PRECISION_BITS] - How many bits of mantissa to preserve in the result.
 * @returns The quotient of bd1 and bd2 (bd1 / bd2).
 */
function divide_floating(bd1: BigDecimal, bd2: BigDecimal, mantissaBits: number = DEFAULT_MANTISSA_PRECISION_BITS): BigDecimal {
	if (bd2.bigint === ZERO) throw new Error("Division by zero is not allowed.");
	if (bd1.bigint === ZERO) return { bigint: ZERO, divex: mantissaBits }; // Or any divex, normalize will handle it.

	// 1. Calculate bit length of the absolute values for a magnitude comparison.
	const len1 = bimath.bitLength_bisection(bimath.abs(bd1.bigint));
	const len2 = bimath.bitLength_bisection(bimath.abs(bd2.bigint));

	// 2. Determine the necessary left shift.
	// We need to shift bd1.bigint left enough so that the resulting quotient has 'mantissaBits' of precision.
	const bitDifference = len2 - len1;
    
	// We need to shift by the difference in bit lengths (if bd2 is larger) PLUS the desired final mantissa bits.
	// We add 1 for extra safety against off-by-one truncation errors in the integer division.
	const requiredShift = BigInt(Math.max(bitDifference, 0) + mantissaBits + 1);

	// 3. Scale the dividend up by the required shift amount.
	const scaledDividend = bd1.bigint << requiredShift;

	// 4. Perform the single, precise integer division.
	const quotient = scaledDividend / bd2.bigint;
    
	// 5. Calculate the new divex for the result.
	// The total scaling factor is 2^requiredShift from our scaling,
	// and we must also account for the original exponents.
	const newDivex = bd1.divex - bd2.divex + Number(requiredShift);

	// 6. Normalize the result to the target mantissa size. This will trim any excess bits
	// if the dividend was much larger than the divisor.
	return normalize({ bigint: quotient, divex: newDivex }, mantissaBits);
}

/**
 * Calculates the modulo between two BigDecimals.
 * @param bd1 The dividend.
 * a@param bd2 The divisor.
 * @returns The remainder as a new BigDecimal, with the same precision as the dividend.
 */
function mod(bd1: BigDecimal, bd2: BigDecimal): BigDecimal {
	if (bd2.bigint === ZERO) throw new Error("Cannot perform modulo operation with a zero divisor.");

	const bigint1 = bd1.bigint;
	let bigint2 = bd2.bigint;

	// The result's scale is determined by the dividend.
	const targetDivex = bd1.divex;

	// We must bring bd2 to the same scale as bd1.
	const divexDifference = targetDivex - bd2.divex;

	if (divexDifference > 0) {
		// bd2 has less precision, scale it up (left shift).
		bigint2 <<= BigInt(divexDifference);
	} else if (divexDifference < 0) {
		// bd2 has more precision, scale it down (right shift).
		// This involves truncation, which is standard for modulo operations.
		bigint2 >>= BigInt(-divexDifference);
	}

	// Now that both bigints are at the same scale as the dividend,
	// we can use the native remainder operator.
	const remainderBigInt = bigint1 % bigint2;

	return {
		bigint: remainderBigInt,
		divex: targetDivex, // The result's divex matches the dividend's.
	};
}

/**
 * Calculates the integer power of a BigDecimal (base^exp).
 * This uses the "exponentiation by squaring" algorithm for efficiency.
 */
function powerInt(base: BigDecimal, exp: number): BigDecimal {
	if (!Number.isInteger(exp)) throw new Error("Exponent must be an integer.");

	// Handle negative exponents by inverting the base: base^-n = (1/base)^n
	if (exp < 0) {
		const ONE = FromBigInt(1n);
		// Use floating-point division for a precise reciprocal
		const invertedBase = divide_floating(ONE, base);
		return powerInt(invertedBase, -exp);
	}
    
	let res = FromBigInt(1n); // Start with the identity element for multiplication
	let currentPower = base;   // Start with base^1

	while (exp > 0) {
		// If the last bit of exp is 1, we need to multiply by the current power of the base.
		if (exp % 2 === 1) res = multiply_floating(res, currentPower);
		// Square the current power of the base for the next iteration (e.g., x -> x^2 -> x^4 -> x^8).
		currentPower = multiply_floating(currentPower, currentPower);
		// Integer division by 2 is equivalent to a right bit shift.
		exp = Math.floor(exp / 2);
	}

	return res;
}

/**
 * Calculates the power of a BigDecimal to any exponent (base^exp).
 * This works for integer and fractional exponents by using the identity:
 * base^exp = e^(exp * ln(base)).
 * If the exponent is an integer, it automatically uses the more efficient integer power function.
 * @param base The base BigDecimal.
 * @param exponent The exponent BigDecimal.
 * @param mantissaBits The precision of the result in bits.
 * @returns A new BigDecimal representing base^exp.
 */
function pow(base: BigDecimal, exponent: BigDecimal, mantissaBits: number = DEFAULT_MANTISSA_PRECISION_BITS): BigDecimal {
	// 1. Handle edge cases
	if (base.bigint < ZERO && !isInteger(exponent)) {
		throw new Error("Power of a negative base to a non-integer exponent results in a complex number, which is not supported.");
	}
	if (base.bigint === ZERO) {
		if (exponent.bigint > ZERO) return { bigint: ZERO, divex: 0 }; // 0^positive = 0
		if (exponent.bigint < ZERO) throw new Error("0 raised to a negative power is undefined (division by zero).");
		return FromBigInt(ONE, mantissaBits); // 0^0 is conventionally 1
	}
	// If the exponent is an integer, use the more efficient integer power function.
	if (isInteger(exponent)) {
		const expAsNumber = toNumber(exponent);
		return powerInt(base, expAsNumber);
	}

	// 2. Calculate ln(base) as a standard JavaScript number.
	const logOfBase = ln(base);
    
	// 3. Convert the exponent to a standard number to multiply. This is a potential precision loss
	//    if the exponent itself is a massive BigDecimal, but is a practical simplification.
	const exponentAsNumber = toNumber(exponent);

	// 4. Multiply: exponent * ln(base)
	const product = exponentAsNumber * logOfBase;
    
	// 5. Convert the resulting number back to a BigDecimal to be used in exp().
	const productBD = FromNumber(product, mantissaBits);

	// 6. Calculate the final result: e^(product)
	return exp(productBD, mantissaBits);
}

/**
 * [Floating-Point Model] Calculates the square root of a BigDecimal using Newton's method.
 * The precision of the result is determined by the `mantissaBits` parameter.
 */
function sqrt(bd: BigDecimal, mantissaBits: number = DEFAULT_MANTISSA_PRECISION_BITS): BigDecimal {
	// 1. Validate input
	if (bd.bigint < ZERO) throw new Error("Cannot calculate the square root of a negative number.");
	if (bd.bigint === ZERO) return { bigint: ZERO, divex: bd.divex };

	// 2. Make an initial guess (x_0)
	// A good initial guess is crucial for fast convergence.
	// A common technique is to use a value related to 2^(bitLength/2).
	// But that's the bitlength of the INTEGER portion, none of the decimal bits.
	const bitLength = bimath.bitLength_bisection(bd.bigint) - bd.divex; // Subtract the decimal bits
	let x_k = {
		bigint: ONE,
		divex: Math.round(-bitLength / 2)
	};
	// console.log("Initial guess for sqrt (before normalization):"); printInfo(x_k);
	// Align the guess to same precision as subsequent calculations.
	x_k = normalize(x_k, mantissaBits); // Normalize the guess to the desired mantissa bits.
	// console.log(`Initial guess for sqrt:`); printInfo(x_k);

	// 3. Iterate using Newton's method: x_{k+1} = (x_k + n / x_k) / 2
	// We continue until the guess stabilizes.
	let last_x_k = clone(x_k); // A copy to check for convergence

	const MAX_ITERATIONS = 100; // Limit iterations to prevent infinite loops in case of non-convergence.
	// console.log(`Starting sqrt iterations with mantissaBits = ${mantissaBits}`);
	for (let i = 0; i < MAX_ITERATIONS; i++) {

		// Calculate `n / x_k` using high-precision floating division
		const n_div_xk = divide_floating(bd, x_k, mantissaBits * 2);
		// Calculate `x_k + (n / x_k)`
		const sum = add(x_k, n_div_xk);
		// Divide by 2: `(sum) / 2`. A right shift is equivalent to division by 2.
		x_k = { bigint: sum.bigint >> ONE, divex: sum.divex };

		// Check for convergence: if the guess is no longer changing, we've found our answer.
		// console.log(`Iteration ${i}: x_k = ${toExactString(x_k)}`);
		if (areEqual(x_k, last_x_k)) {
			// console.log(`Reached convergence in sqrt after ${i} iterations.`);
			return x_k;
		}

		// Prepare for the next iteration.
		last_x_k = clone(x_k);
		i++;
	}

	// If the loop completes without converging, something is wrong.
	throw new Error(`sqrt failed to converge after ${MAX_ITERATIONS} iterations.`);
}

/**
 * [Floating-Point Model] Calculates the hypotenuse of two BigDecimals (sqrt(a^2 + b^2)).
 * This is equivalent to the length of the vector (bd1, bd2).
 * The precision of the result is determined by the `mantissaBits` parameter.
 */
function hypot(bd1: BigDecimal, bd2: BigDecimal, mantissaBits: number = DEFAULT_MANTISSA_PRECISION_BITS): BigDecimal {
	// 1. Square the inputs
	const bd1_squared = multiply_fixed(bd1, bd1);
	const bd2_squared = multiply_fixed(bd2, bd2);

	// 2. Add the squares together.
	const sum_of_squares: BigDecimal = add(bd1_squared, bd2_squared);

	// 3. Calculate the square root of the sum to get the final result.
	const result = sqrt(sum_of_squares, mantissaBits);

	return result;
}

/**
 * Returns a new BigDecimal that is the absolute value of the provided BigDecimal.
 * @param bd - The BigDecimal.
 * @returns A new BigDecimal representing the absolute value.
 */
function abs(bd: BigDecimal): BigDecimal {
	// The sign is determined solely by the bigint.
	// The divex (scale) remains the same.
	// We return a new object and do not modify the original.
	return {
		bigint: bd.bigint < ZERO ? -bd.bigint : bd.bigint,
		divex: bd.divex
	};
}

/** Returns a deep copy of the original big decimal. */
function clone(bd: BigDecimal): BigDecimal {
	return {
		bigint: bd.bigint,
		divex: bd.divex,
	};
}

/**
 * Modifies the BigDecimal to have the specified divex, always rounding half up.
 * @param bd The BigDecimal to modify.
 * @param divex The target divex.
 */
function setExponent(bd: BigDecimal, divex: number): void {
	if (divex < -MAX_DIVEX || divex > MAX_DIVEX) throw new Error(`Divex must be between -${MAX_DIVEX} and ${MAX_DIVEX}. Received: ${divex}`);

	const difference = bd.divex - divex;

	// If there's no change, do nothing.
	if (difference === 0) return;

	// If the difference is negative, we are increasing precision (shifting left).
	// This is a pure scaling operation and never requires rounding.
	if (difference < 0) {
		bd.bigint <<= BigInt(-difference);
		bd.divex = divex;
		return;
	}

	// We are now decreasing precision (shifting right), so we must round.

	// To "round half up", we add 0.5 before truncating.
	// "0.5" relative to the part being discarded is 1 bit shifted by (difference - 1).
	const half = ONE << BigInt(difference - 1);
    
	bd.bigint += half;
	bd.bigint >>= BigInt(difference);
	bd.divex = divex;
}

/**
 * Compares two BigDecimals.
 * @param bd1 The first BigDecimal.
 * @param bd2 The second BigDecimal.
 * @returns -1 if bd1 < bd2, 0 if bd1 === bd2, and 1 if bd1 > bd2.
 */
function compare(bd1: BigDecimal, bd2: BigDecimal): -1 | 0 | 1 {
	// To compare, we must bring them to a common divex, just like in add/subtract.
	// However, we don't need to create new objects.

	let bigint1 = bd1.bigint;
	let bigint2 = bd2.bigint;

	if (bd1.divex > bd2.divex) {
		// Scale up bd2 to match bd1's divex.
		bigint2 <<= BigInt(bd1.divex - bd2.divex);
	} else if (bd2.divex > bd1.divex) {
		// Scale up bd1 to match bd2's divex.
		bigint1 <<= BigInt(bd2.divex - bd1.divex);
	}
	// If divex are equal, no scaling is needed.

	// Now that they are at the same scale, we can directly compare the bigints.
	return bigint1 < bigint2 ? -1 : bigint1 > bigint2 ? 1 : 0;
}

/** Tests if two BigDecimals are equal in value. */
function areEqual(bd1: BigDecimal, bd2: BigDecimal): boolean {
	return compare(bd1, bd2) === 0;
}

/** Negates a BigDecimal */
function negate(bd: BigDecimal): BigDecimal {
	return { bigint: -bd.bigint, divex: bd.divex, };
}

/** Returns the smaller of two BigDecimals. */
function min(bd1: BigDecimal, bd2: BigDecimal): BigDecimal {
	return compare(bd1, bd2) === 1 ? bd2 : bd1;
}

/** Returns the larger of two BigDecimals. */
function max(bd1: BigDecimal, bd2: BigDecimal): BigDecimal {
	return compare(bd1, bd2) === -1 ? bd2 : bd1;
}

/** Returns a new BigDecimal that is clamped between the specified minimum and maximum values. */
function clamp(bd: BigDecimal, min: BigDecimal, max: BigDecimal): BigDecimal {
	return compare(bd, min) < 0 ? min : compare(bd, max) > 0 ? max : bd;
}

/**
 * Calculates the floor of a BigDecimal (the largest integer less than or equal to it).
 * The resulting BigDecimal will have the same divex as the input.
 * e.g., floor(2.7) -> 2.0, floor(-2.7) -> -3.0
 * @param bd The BigDecimal to process.
 * @returns A new BigDecimal representing the floored value, at the same precision.
 */
function floor(bd: BigDecimal): BigDecimal {
	// If divex is non-positive, the number is already an integer value.
	if (bd.divex <= 0) return { bigint: bd.bigint, divex: bd.divex };

	const divexBigInt = BigInt(bd.divex);
	const scale = ONE << divexBigInt;

	// The remainder when dividing by the scale factor.
	// This tells us if there is a fractional part.
	const remainder = bd.bigint % scale;

	// If there's no remainder, it's already a whole number.
	if (remainder === ZERO) return { bigint: bd.bigint, divex: bd.divex };

	let flooredBigInt: bigint;
	if (bd.bigint >= ZERO) {
		// For positive numbers, floor is simple truncation.
		// We subtract the remainder to get to the nearest multiple of the scale below.
		flooredBigInt = bd.bigint - remainder;
	} else {
		// For negative numbers, floor means going more negative.
		// e.g., floor of -2.5 is -3.
		// We subtract the scale factor and then add back the negative remainder.
		flooredBigInt = bd.bigint - remainder - scale;
	}

	return {
		bigint: flooredBigInt,
		divex: bd.divex,
	};
}

/**
 * Calculates the ceiling of a BigDecimal (the smallest integer greater than or equal to it).
 * The resulting BigDecimal will have the same divex as the input.
 * e.g., ceil(2.1) -> 3.0, ceil(-2.1) -> -2.0
 * @param bd The BigDecimal to process.
 * @returns A new BigDecimal representing the ceiled value, at the same precision.
 */
function ceil(bd: BigDecimal): BigDecimal {
	// If divex is non-positive, the number is already an integer value.
	if (bd.divex <= 0) return { bigint: bd.bigint, divex: bd.divex };

	const divexBigInt = BigInt(bd.divex);
	const scale = ONE << divexBigInt;
	const remainder = bd.bigint % scale;

	// If there's no remainder, it's already a whole number.
	if (remainder === ZERO) return { bigint: bd.bigint, divex: bd.divex };
	
	let ceiledBigInt: bigint;
	if (bd.bigint >= ZERO) {
		// For positive numbers, ceil means going more positive.
		// e.g., ceil of 2.1 is 3.
		// We subtract the remainder and then add the scale factor.
		ceiledBigInt = bd.bigint - remainder + scale;
	} else {
		// For negative numbers, ceil is simple truncation (towards zero).
		ceiledBigInt = bd.bigint - remainder;
	}

	return {
		bigint: ceiledBigInt,
		divex: bd.divex,
	};
}

/** Checks if a BigDecimal represents a perfect integer (a whole number). */
function isInteger(bd: BigDecimal): boolean {
	// If divex is non-positive, the number is already an integer value.
	// The value is bigint * 2^(-divex), which is guaranteed to be an integer.
	if (bd.divex <= 0) return true;

	// If divex is positive, the value is an integer only if the `bigint`
	// is a multiple of 2^divex. This means the fractional part is zero.
	const scale = ONE << BigInt(bd.divex);

	// If the remainder of the bigint when divided by the scale is zero,
	// it means all fractional bits are 0, so it's a perfect integer.
	// It is almost CERTAIN this is highly optimized by the JS engine,
	// since the divisor is a power of two. This should be on par with bitwise operations.
	return bd.bigint % scale === ZERO;
}

/**
 * Checks if both coordinates in a BDCoords tuple represent perfect integers.
 * This is useful for determining if a point lies exactly on an integer grid.
 * @param coords The BDCoords tuple [x, y] to check.
 * @returns True if both the x and y coordinates are whole numbers.
 */
function areCoordsIntegers(coords: BDCoords): boolean {
	return isInteger(coords[0]) && isInteger(coords[1]);
}

/** Calculates the base-10 logarithm of a BigDecimal. */
function log10(bd: BigDecimal): number {
	// Use the change of base formula: log10(x) = ln(x) / ln(10).
	return ln(bd) / Math.LN10;
}

/** Calculates the natural logarithm (base e) of a BigDecimal. */
function ln(bd: BigDecimal): number {
	if (bd.bigint < ZERO) return NaN;
	if (bd.bigint === ZERO) return -Infinity;

	// Use the formula: ln(bigint / 2^divex) = ln(bigint) - (divex * ln(2))
	const logOfMantissa = bimath.ln(bd.bigint);
	const logOfScale = bd.divex * Math.LN2;

	return logOfMantissa - logOfScale;
}

/**
 * Calculates the exponential function e^bd (the inverse of the natural logarithm).
 * This is computed using a Taylor Series expansion for arbitrary precision.
 * @param bd The BigDecimal exponent.
 * @param mantissaBits The precision of the result in bits.
 * @returns A new BigDecimal representing e^bd.
 */
function exp(bd: BigDecimal, mantissaBits: number = DEFAULT_MANTISSA_PRECISION_BITS): BigDecimal {
	// The Taylor series for e^x is Σ (x^n / n!) from n=0 to infinity.
	// We can compute this iteratively: term_n = term_{n-1} * (x / n)

	// Initialize sum and the first term (x^0 / 0! = 1)
	let sum = FromBigInt(1n, mantissaBits);
	let term = clone(sum);
	let lastSum = FromBigInt(0n, mantissaBits);

	const MAX_ITERATIONS = 1000; // Safety break to prevent infinite loops

	for (let n = 1; n < MAX_ITERATIONS; n++) {
		const n_bd = FromBigInt(BigInt(n), mantissaBits);

		// Calculate the next term: term = term * (bd / n)
		const bd_div_n = divide_floating(bd, n_bd, mantissaBits);
		term = multiply_floating(term, bd_div_n, mantissaBits);
		
		// Add the new term to the sum
		sum = add(sum, term);

		// Check for convergence. If the sum hasn't changed, we're done.
		if (areEqual(sum, lastSum)) return sum;

		lastSum = clone(sum);
	}

	console.warn(`bigdecimal.exp() may not have fully converged after ${MAX_ITERATIONS} iterations.`);
	return sum;
}


// Floating-Point Model Helpers ====================================================


/** The target number of bits for the mantissa in floating-point operations. Higher is more precise but slower. */
const DEFAULT_MANTISSA_PRECISION_BITS = DEFAULT_WORKING_PRECISION; // Gives us about 7, or 16 digits of precision, depending whether we have 32 bit or 64 bit precision (javascript doubles are 64 bit).

/**
 * Normalizes a BigDecimal to enforce a true floating-point precision model.
 * For any number, it trims the mantissa to `precisionBits` to standardize precision,
 * adjusting the `divex` accordingly. This allows `divex` to become negative to
 * represent large numbers.
 * @param bd The BigDecimal to normalize.
 * @param [precisionBits=DEFAULT_MANTISSA_PRECISION_BITS] The target mantissa bits.
 * @returns A new, normalized BigDecimal.
 */
function normalize(bd: BigDecimal, precisionBits: number = DEFAULT_MANTISSA_PRECISION_BITS): BigDecimal {
	// We work with the absolute value for bit length calculation.
	const mantissa = bimath.abs(bd.bigint);
    
	// Use the fast, mathematical bitLength function.
	const currentBitLength = bimath.bitLength_bisection(mantissa);

	const shiftAmount = BigInt(currentBitLength - precisionBits);

	// Calculate the new divex. It can now be negative.
	const newDivex = bd.divex - Number(shiftAmount);

	// Round using the consistent "half towards positive infinity" method.
	const half = ONE << (shiftAmount - ONE);
	const finalBigInt = (bd.bigint + half) >> shiftAmount;

	return { bigint: finalBigInt, divex: newDivex };
}


// Conversions & Utility ====================================================================


/**
 * Converts a BigDecimal to a BigInt.
 * If the BigDecimal represents a fractional number, it is rounded to the nearest integer
 * using "round half up" (towards positive infinity). E.g., 2.5 becomes 3, and -2.5 becomes -2.
 * If the BigDecimal represents a large integer (with a negative divex), it is scaled appropriately.
 * @param bd The BigDecimal to convert.
 * @returns The rounded BigInt value.
 */
function toBigInt(bd: BigDecimal): bigint {
	// Negative divex means it's a large integer. Scale up.
	if (bd.divex < 0) return bd.bigint << BigInt(-bd.divex);

	// If divex is 0, the number is already a correctly scaled integer.
	if (bd.divex === 0) return bd.bigint;

	const divexBigInt = BigInt(bd.divex);

	// To "round half up", we add 0.5 before truncating.
	// In our fixed-point system, "0.5" is represented by 2^(divex - 1).
	const half = ONE << (divexBigInt - ONE);
	
	// Add half and then truncate. The arithmetic right shift `>>` handles truncation
	// correctly for both positive and negative numbers.
	const adjustedBigInt = bd.bigint + half;
	
	return adjustedBigInt >> divexBigInt;
}

/**
 * Converts a pair of bigdecimal coords into normal bigint Coords.
 * THIS WILL LOSE PRECISION if you aren't already confident that both
 * coordinates are integers!
 */
function coordsToBigInt(coords: BDCoords): Coords {
	// Convert each coordinate to a BigInt using the toBigInt function.
	return [toBigInt(coords[0]), toBigInt(coords[1])];
}

/**
 * Converts a pair of bigdecimal coords into DoubleCoords.
 * Only call if you are CONFIDENT all both coordinates won't overflow or underflow!
 */
function coordsToDoubles(coords: BDCoords): DoubleCoords {
	// Convert each coordinate to a BigInt using the toBigInt function.
	return [toNumber(coords[0]), toNumber(coords[1])];
}

/**
 * Most efficient method to convert a BigDecimal to a number.
 * Only use if you are CONFIDENT the BigDecimal's mantissa (bigint property)
 * will not overflow or underflow the standard javascript number
 * type, AND you are sure the divex is <= 1023!! Otherwise, use {@link toExactNumber}.
 * @param bd - The BigDecimal to convert.
 * @returns The value as a standard javascript number.
 */
function toNumber(bd: BigDecimal) {
	if (bd.divex >= 0) {
		if (bd.divex > MAX_DIVEX_BEFORE_INFINITY) throw new Error(`Cannot convert BigDecimal to number when the divex is greater than ${MAX_DIVEX_BEFORE_INFINITY}!`);
		const mantissaAsNumber = Number(bd.bigint);
		if (!isFinite(mantissaAsNumber)) throw new Error("Cannot convert BigDecimal to number when the bigint/mantissa is over Number.MAX_VALUE!");
		return mantissaAsNumber / powersOfTwoList[bd.divex]!;
	} else { // divex is negative
		const exp = -bd.divex;
		if (exp > MAX_DIVEX_BEFORE_INFINITY) throw new Error(`Cannot convert BigDecimal to number when the positive exponent is greater than ${MAX_DIVEX_BEFORE_INFINITY}!`);
		const mantissaAsNumber = Number(bd.bigint);
		if (!isFinite(mantissaAsNumber)) throw new Error("Cannot convert BigDecimal to number when the bigint/mantissa is over Number.MAX_VALUE!");
		return mantissaAsNumber * powersOfTwoList[exp]!;
	}
}

/**
 * Converts a BigDecimal to a number (javascript double).
 * This conversion is lossy if the BigDecimal's precision exceeds that of a 64-bit float.
 * If the value exceeds Number.MAX_VALUE, it will correctly return Infinity or -Infinity.
 * @param bd - The BigDecimal to convert.
 * @returns The value as a standard javascript number.
 */
function toExactNumber(bd: BigDecimal): number {
	const divexBigInt = BigInt(bd.divex);

	// 1. Separate the integer part without losing any precision yet.
	// A negative divexBigInt correctly results in a left shift.
	const integerPart = bd.bigint >> divexBigInt;

	// 2. Isolate the fractional bits. This also works correctly for negative numbers.
	const fractionalPartShifted = bd.bigint - (integerPart << divexBigInt);
	// Alternative line, around 10-20% slower:
	// const fractionalPartShifted = bimath.getLeastSignificantBits(bd.bigint, divex_bigint)

	// 3. Convert the integer part to a number. This can become Infinity if it's too large.
	const numberResult = Number(integerPart);

	// If the integer part is already +/- Infinity, the fractional part is irrelevant.
	if (!isFinite(numberResult)) return numberResult;
	
	// 4. Convert the fractional part to a number.
	// We use a MAXIMUM precision (1023 bits) to avoid overflow during this cast.
	const MAX_BITS_FOR_FRACTIONAL_CAST = MAX_DIVEX_BEFORE_INFINITY; // 1023
	let decimalPartAsNumber: number;
	let finalExponent: number = -bd.divex;

	if (bd.divex <= MAX_BITS_FOR_FRACTIONAL_CAST) {
		// The divex is small enough. A direct cast is safe, and won't become Infinite.
		decimalPartAsNumber = Number(fractionalPartShifted);
	} else {
		// The divex is too large, casting the fractional part would result in Infinity.
		// Truncate the LEAST significant bits of the
		// fractional part before casting to avoid an overflow.
		const shiftAmount = bd.divex - MAX_BITS_FOR_FRACTIONAL_CAST;
		decimalPartAsNumber = Number(fractionalPartShifted >> BigInt(shiftAmount));
		finalExponent += shiftAmount;
	}

	// 5. Scale the resulting number representation of the fractional part back down.
	const decimalResult = decimalPartAsNumber * (2 ** finalExponent);

	// 6. Return the final sum.
	return numberResult + decimalResult;
}

/**
 * Converts a BigDecimal to a string. This returns its EXACT value!
 *
 * Note: Due to the nature of all binary fractions having power-of-2 denominators,
 * this string can make it appear as if they have more decimal digit precision than they actually do.
 * For example, 1/1024 = 0.0009765625, which at first glance *looks* like it has
 * 9 digits of decimal precision, but in all effectiveness it only has 3 digits of precision,
 * because a single increment to 2/1024 now yields 0.001953125, which changed **every single** digit!
 * The effective decimal digits can be calculated using {@link getEffectiveDecimalPlaces}.
 * @param bd The BigDecimal to convert.
 * @returns The string with the exact value.
 */
function toExactString(bd: BigDecimal): string {
	if (bd.bigint === ZERO) return '0';
	if (bd.divex < 0) return toBigInt(bd).toString(); // Negative divex: It's a large integer.
	if (bd.divex === 0) return bd.bigint.toString();

	const isNegative = bd.bigint < ZERO;
	// Use the absolute value for all calculations and add the sign back at the end.
	const absBigInt = isNegative ? -bd.bigint : bd.bigint;
	const divexBigInt = BigInt(bd.divex);

	// 1. Separate the integer and fractional parts.
	const integerPart = absBigInt >> divexBigInt;
	const fractionalPart = absBigInt - (integerPart << divexBigInt);

	// If there's no fraction, we are done. This is a crucial optimization.
	if (fractionalPart === ZERO) return (isNegative ? '-' : '') + integerPart.toString();

	// 2. Convert the fractional part to a decimal string using the 5**N shortcut.
	// The math is: (fractional / 2^d) * 10^d = fractional * 5^d
	const powerOfFive = FIVE ** divexBigInt;
	const decimalDigits = fractionalPart * powerOfFive;
	
	// 3. Pad the decimal string with leading zeros to match the divex.
	let decimalString = decimalDigits.toString().padStart(bd.divex, '0');
	
	// And trim any trailing zeros.
	let i = decimalString.length - 1;
	while (i >= 0 && decimalString[i] === '0') {
		i--;
	}
	decimalString = decimalString.slice(0, i + 1);

	// 4. Combine the parts and the sign into the final string.
	const sign = isNegative ? '-' : '';
	const integerString = integerPart.toString();
	
	// This check is for robustness in case the entire fraction was zeros.
	if (decimalString.length === 0)  return sign + integerString;
	else return sign + integerString + '.' + decimalString;
}

/**
 * Converts a BigDecimal to a human-readable string, rounded to its
 * "effective" number of decimal places. This trims extraneous digits that
 * arise from the binary-to-decimal conversion, providing a cleaner output.
 * For the exact stored value, use `toExactString()`.
 * @param bd The BigDecimal to convert.
 * @returns The effectively rounded number as a string.
 */
function toString(bd: BigDecimal): string {
	// 1. Handle the zero case simply.
	if (bd.bigint === ZERO) return '0';
    
	// 2. Determine the effective number of decimal places to round to.
	const decimalPlaces = getEffectiveDecimalPlaces(bd);

	// If there's no fractional part to consider (or it's a large integer), just round to a BigInt and return.
	if (decimalPlaces <= 0) return toBigInt(bd).toString();
    
	// 3. Round to the target decimal places.
	// The logic is: multiply by 10^P, round, then format back to a string.
	const powerOfTen = TEN ** BigInt(decimalPlaces);
	// Use the logic from `multiply_floating` to get an exact scaled value
	// before rounding, avoiding the precision loss of `multiply_fixed`.
	const scaledBigInt = bd.bigint * powerOfTen;
	const scaledDivex = bd.divex;
	const scaledBd = { bigint: scaledBigInt, divex: scaledDivex };
	const roundedScaledInt = toBigInt(scaledBd);

	// 4. Format the resulting integer back into a decimal string.
	const absStr = bimath.abs(roundedScaledInt).toString();

	let integerPart: string;
	let fractionalPart: string;

	if (absStr.length > decimalPlaces) {
		// The number is >= 1.0
		const splitPoint = absStr.length - decimalPlaces;
		integerPart = absStr.substring(0, splitPoint);
		fractionalPart = absStr.substring(splitPoint);
	} else {
		// The number is < 1.0, requires left-padding with zeros.
		integerPart = '0';
		fractionalPart = absStr.padStart(decimalPlaces, '0');
	}

	// 5. Trim meaningless trailing zeros from the fractional part.
	const trimmedFractionalPart = fractionalPart.replace(/0+$/, '');
    
	const sign = roundedScaledInt < ZERO ? '-' : '';

	// 6. Combine and return the final string.
	if (trimmedFractionalPart.length === 0) return sign + integerPart; // If the entire fractional part was zeros, don't show the decimal point.
	else return sign + integerPart + '.' + trimmedFractionalPart;
}

/**
 * Returns the BigDecimal's `bigint` property in binary form, **exactly** like how computers store them,
 * in two's complement notation. Negative values have all their bits flipped, and then added 1.
 * To multiply by -1, reverse all the bits, and add 1. This works both ways.
 * 
 * For readability, if the number is negative, a space will be added after the leading '1' sign.
 * @param bd - The BigDecimal
 * @returns The binary string. If it is negative, the leading `1` sign will have a space after it for readability.
 */
function toDebugBinaryString(bd: BigDecimal): string {
	return bimath.toDebugBinaryString(bd.bigint);
}

/**
 * Prints useful information about the BigDecimal, such as its properties,
 * binary string, exact value as a string, and converted back to a number.
 * @param bd - The BigDecimal
 */
function printInfo(bd: BigDecimal): void {
	console.log(bd);
	console.log(`Binary string: ${toDebugBinaryString(bd)}`);
	// console.log(`Bit length: ${MathBigDec.getBitLength(bd)}`)
	console.log(`Converted to Exact String: ${toExactString(bd)}`); // This is also its EXACT value.
	console.log(`Converted to String: ${toString(bd)}`);
	console.log(`Converted to Exact Number: ${toExactNumber(bd)}`);
	console.log(`Converted to Number: ${toNumber(bd)}`);
	console.log(`Converted to BigInt: ${toBigInt(bd)}`);
	console.log('----------------------------');
}

/**
 * Estimates the number of effective decimal place precision of a BigDecimal.
 * This is based on the formula `floor(divex * log10(2))`. A negative result
 * indicates the approximate number of trailing zeros in a large integer.
 * @param bd - The BigDecimal
 * @returns The number of estimated effective decimal places.
 */
function getEffectiveDecimalPlaces(bd: BigDecimal): number {
	return Math.floor(bd.divex * LOG10_OF_2);
}


// HOLD OFF ON THESE FOR NOW, I'M NOT SURE IF WE WILL NEED THEM...

// /**
//  * TO BE WRITTEN...
//  * 
//  * Detects if the provided BigDecimals are equal.
//  * To do this, it first tries to convert them into the same divex level,
//  * because BigDecimals of different divex levels may still be equal,
//  * so it's not enough to compare their `bigint` properties.
//  * @param bd1 - BigDecimal1
//  * @param bd2 - BigDecimal2
//  * @returns *true* if they are equal
//  */
// areEqual(bd1: BigDecimal, bd2: BigDecimal): void {

// },

// isGreaterThan(bd1: BigDecimal, bd2: BigDecimal): void {

// },

// isGreaterThanOrEqualTo(bd1: BigDecimal, bd2: BigDecimal): void {

// },

// isLessThan(bd1: BigDecimal, bd2: BigDecimal): void {

// },

// isLessThanOrEqualTo(bd1: BigDecimal, bd2: BigDecimal): void {

// },

// isInteger(bd: BigDecimal): void {

// },


// Exports ====================================================================


export default {
	// NewBigDecimal_FromString,
	FromNumber,
	FromBigInt,
	FromCoords,
	FromDoubleCoords,
	// Helpers
	howManyBitsForDigitsOfPrecision,
	getEffectiveDecimalPlaces,
	// Math and Arithmetic
	add,
	subtract,
	multiply_fixed,
	multiply_floating,
	divide_fixed,
	divide_floating,
	mod,
	powerInt,
	pow,
	sqrt,
	hypot,
	abs,
	clone,
	setExponent,
	compare,
	areEqual,
	negate,
	min,
	max,
	clamp,
	floor,
	ceil,
	isInteger,
	areCoordsIntegers,
	log10,
	ln,
	exp,
	// Conversions and Utility
	toBigInt,
	coordsToBigInt,
	coordsToDoubles,
	// toExactNumber,
	toNumber,
	toExactString,
	toString,
	toDebugBinaryString,
	printInfo,
};

export type {
	BigDecimal
};



/////////////////////////////////////////////////////////////////////////////////////
// Testing
/////////////////////////////////////////////////////////////////////////////////////



// const n1 = 155.66;
// const bd1: BigDecimal = FromNumber(n1);
// console.log(`${n1} converted into a BigDecimal:`);
// printInfo(bd1);

// const n2: number = 5.56;
// const bd2: BigDecimal = FromNumber(n2);
// console.log(`\n${n2} converted into a BigDecimal:`);
// printInfo(bd2);

// console.log(`Starting sqrt test on ${n1}...`);
// const bd3 = sqrt(bd1);
// console.log(`\nSqrt ${n1}:`);
// printInfo(bd3);

// const power2 = 3;
// const bd4 = power(bd1, 3);
// console.log(`\nPower ${n1} by ${power2}:`);
// printInfo(bd4);

// const bd5 = mod(bd1, bd2);
// console.log(`\nMod ${n1} by ${n2}:`);
// printInfo(bd5);



// for (let i = 0; i < 20; i++) {
// 	// Multiply by 0.1 each time.
// 	// bd1 = divide_fixed(bd1, bd2);
// 	// bd1 = divide_floating(bd1, bd2);
// 	bd1 = multiply_floating(bd1, bd2);
// 	printInfo(bd1);
// 	// console.log("Effective digits: ", getEffectiveDecimalPlaces(bd1));
// }



/////////////////////////////////////////////////////////////////////////////////////
// Comprehensive Interaction Verification Suite
/////////////////////////////////////////////////////////////////////////////////////

function runComprehensiveVerification() {
	console.log('--- Running Comprehensive Interaction Verification Suite ---');
	console.log('Verifying all function outputs by inspecting their internal state.\n');

	// Helper to print a header and then the full info of a BigDecimal result
	function testAndPrint(name: string, result: BigDecimal) {
		console.log(`\n▶ TEST: ${name}`);
		printInfo(result);
	}
    
	// Helper for primitives
	function testPrimitive(name: string, result: any) {
		console.log(`\n▶ TEST: ${name}`);
		console.log(`  Result: ${result}`);
		console.log('----------------------------');
	}

	// --- Test Values ---
	const testValues = [
        NewBigDecimal_FromString("10.6"),
        NewBigDecimal_FromString("-2.6"),
        NewBigDecimal_FromString("7"),
        NewBigDecimal_FromString("0.387"),
        NewBigDecimal_FromString("-0.58"),
        NewBigDecimal_FromString("0"),
        NewBigDecimal_FromString("1234567890123456789123456789"),
        NewBigDecimal_FromString("0.000000000000000000000000000000125"),
        NewBigDecimal_FromString("10000000000005325325325.00058389299239593235325325235325")
    ];

	// =================================================================================
	// Part 1: Single-Operand Function Tests
	// =================================================================================
	console.log("--- Part 1: Verifying Single-Operand Functions ---\n");
	for (const bd of testValues) {
		const bd_str = toString(bd);
		// console.log(`\n\n################### Testing against value: ${bd_str} ###################\n`);

		printInfo(bd);

		// testPrimitive("toBigInt()", `${toBigInt(bd)}n`);
		// testPrimitive("toNumber()", toNumber(bd));
		// testPrimitive("getEffectiveDecimalPlaces()", getEffectiveDecimalPlaces(bd));
        
		// const temp_bd_down = clone(bd);
		// setExponent(temp_bd_down, 20);
		// testAndPrint("setExponent(20) (decrease precision)", temp_bd_down);
		// const temp_bd_up = clone(bd);
		// setExponent(temp_bd_up, temp_bd_up.divex + 20);
		// testAndPrint("setExponent(divex+20) (increase precision)", temp_bd_up);
	}

	// =================================================================================
	// Part 2: Two-Operand Function Interaction Tests
	// =================================================================================
	// console.log("\n\n--- Part 2: Verifying Two-Operand Function Interactions ---\n");
	// for (const bd1 of testValues) {
	// 	const str1 = toString(bd1);
	// 	console.log(`\n\n################### Testing interactions with Operand 1: ${str1} ###################`);
        
	// 	for (const bd2 of testValues) {
	// 		const str2 = toString(bd2);
            
	// 		testAndPrint(`add(${str1}) + (${str2})`, add(bd1, bd2));
	// 		testAndPrint(`subtract(${str1}) - (${str2})`, subtract(bd1, bd2));
	// 		testAndPrint(`multiply(${str1}) * (${str2})`, multiply(bd1, bd2));
	// 		testPrimitive(`compare(${str1}) vs (${str2})`, compare(bd1, bd2));

	// 		// Divide - Proactively check for zero divisor
	// 		if (str2 === "0") {
	// 			console.log(`\n▶ TEST: divide(${str1}) / (${str2})`);
	// 			console.log("  Result: Skipped (Division by zero)");
	// 			console.log('----------------------------');
	// 		} else {
	// 			testAndPrint(`divide(${str1}) / (${str2})`, divide(bd1, bd2));
	// 		}
	// 	}
	// }

	console.log('\n--- Comprehensive Interaction Verification Finished ---');
}

// Run the verification
// runComprehensiveVerification();