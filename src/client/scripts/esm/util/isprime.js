/*
Source: https://github.com/latonv/MillerRabinPrimality
Adapted by Andreas Tsevas
See attached license below:

MIT License

Copyright (c) Laton Vermette (https://latonv.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Note to myself, Naviary: ----------------------------------------------------------------------
// Anything above 341550071728321 has an extremely low probability of returning false positives.
// As long as both players use the same seeded RNG, then this will never break games if one
// player's Huygen has different legal moves than the others.
// The chance of false positives can further be reduced by modifying getAdaptiveNumRounds() to do more checks.
// -----------------------------------------------------------------------------------------------

"use strict";

// Some useful BigInt constants
const ZERO = 0n;
const ONE = 1n;
const TWO = 2n;
const FOUR = 4n;
const LIMIT_DETERMINISM = 2n ** 64n;
const LOWER_LIMIT_MONTGOMMERY = 10n ** 30n;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

// Useful int constants
// See https://en.wikipedia.org/wiki/Miller%E2%80%93Rabin_primality_test#Testing_against_small_sets_of_bases
// and: https://oeis.org/A014233
// and longer base lists: https://en.wikipedia.org/wiki/Miller%E2%80%93Rabin_primality_test#Deterministic_variants_of_the_test 
const LIMIT_2 = 2047;
const LIMIT_2_3 = 1373653;
const LIMIT_2_3_5 = 25326001;
const LIMIT_2_3_5_7 = 3215031751;
const LIMIT_2_3_5_7_11 = 2152302898747;
const LIMIT_2_3_5_7_11_13 = 3474749660383;
const LIMIT_2_3_5_7_11_13_17 = 341550071728321;
const SAFE_SQRT = Math.sqrt(Number.MAX_SAFE_INTEGER);

// Bases for deterministic Miller-Rabin
// See https://en.wikipedia.org/wiki/Miller%E2%80%93Rabin_primality_test#Testing_against_small_sets_of_bases
// and: https://oeis.org/A014233
// and: https://miller-rabin.appspot.com/
const INT_BASES = [2, 3, 5, 7, 11, 13, 17, 19, 23];
const BIGINT_BASES = [2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n];

/**
 * Calculates the inverse of `2^exp` modulo the given odd `base`.
 *
 * @param {number} exp The exponent of the power of 2 that should be inverted (_not_ the power of 2 itself!)
 * @param {bigint} base The modulus to invert with respect to
 * @returns {bigint}
 */
function invertPowerOfTwo(exp, base) {
	// Penk's rshift inversion method, but restricted to powers of 2 and odd bases (which is all we require for Miller-Rabin)
	// Just start from 1 and repeatedly halve, adding the base whenever necessary to remain even.
	let inv = ONE;
	for (let i = 0; i < exp; i++) {
		if (inv & ONE) inv += base;
		inv >>= ONE;
	}

	return inv;
}

/**
 * Calculates the multiplicity of 2 in the prime factorization of `n` -- i.e., how many factors of 2 `n` contains.
 * So if `n = 2^k * d` and `d` is odd, the returned value would be `k`.
 *
 * @param {bigint} n Any number
 * @returns {bigint} The multiplicity of 2 in the prime factorization of `n`
 */
function twoMultiplicity(n) {
	if (n === ZERO) return ZERO;

	let m = ZERO;
	while (true) {
		// Since n is not 0, it must have a leading 1 bit, so this is safe
		if (n & (ONE << m)) return m; // Bail out when we reach the least significant 1 bit
		m++;
	}
}

/**
 * Produces a string of random bits with the specified length.
 * Mainly useful as input to BigInt constructors that take digit strings of arbitrary length.
 *
 * @param {number} numBits How many random bits to return.
 * @returns {string} A string of `numBits` random bits.
 */
function getRandomBitString(numBits) {
	let bits = "";
	while (bits.length < numBits) {
		bits += Math.random()
			.toString(2)
			.substring(2, 50);
	}
	return bits.substring(0, numBits);
}

/**
 * Produces a Montgomery reduction context that can be used to define and operate on numbers in Montgomery form
 * for the given base.
 *
 * @param {bigint} base The modulus of the reduction context. Must be an odd number.
 * @returns {MontgomeryReductionContext}
 */
function getReductionContext(base) {
	if (!(base & ONE)) throw new Error(`base must be odd`);

	// Select the auxiliary modulus r to be the smallest power of two greater than the base modulus
	const numBits = bitLength(base);
	const littleShift = numBits;
	const shift = BigInt(littleShift);
	const r = ONE << shift;

	// Calculate the modular inverses of r (mod base) and base (mod r)
	const rInv = invertPowerOfTwo(littleShift, base);
	const baseInv = r - (((rInv * r - ONE) / base) % r); // From base*baseInv + r*rInv = 1  (mod r)

	return { base, shift, r, rInv, baseInv };
}

/**
 * Convert the given number into its Montgomery form, according to the given Montgomery reduction context.
 *
 * @param {bigint} n Any number
 * @param {MontgomeryReductionContext} ctx The Montgomery reduction context to reduce into
 * @returns {bigint} The Montgomery form of `n`
 */
function montgomeryReduce(n, ctx) {
	return (n << ctx.shift) % ctx.base;
}

// /**
//  * Converts the given number _out_ of Montgomery form, according to the given Montgomery reduction context.
//  *
//  * @param {bigint} n A number in Montgomery form
//  * @param {MontgomeryReductionContext} ctx The Montgomery reduction context to reduce out of
//  * @returns {bigint} The (no longer Montgomery-reduced) number whose Montgomery form was `n`
//  */
// function invMontgomeryReduce(n, ctx) {
//   return (n * ctx.rInv) % ctx.base
// }

/**
 * Squares a number in Montgomery form.
 *
 * @param {bigint} n A number in Montgomery form
 * @param {MontgomeryReductionContext} ctx The Montgomery reduction context to square within
 * @returns {bigint} The Montgomery-reduced square of `n`
 */
function montgomerySqr(n, ctx) {
	return montgomeryMul(n, n, ctx);
}

/**
 * Multiplies two numbers in Montgomery form.
 *
 * @param {bigint} a A number in Montgomery form
 * @param {bigint} b A number in Montgomery form
 * @param {MontgomeryReductionContext} ctx The Montgomery reduction context to multiply within
 * @returns {bigint} The Montgomery-reduced product of `a` and `b`
 */
function montgomeryMul(a, b, ctx) {
	if (a === ZERO || b === ZERO) return ZERO;

	const rm1 = ctx.r - ONE;
	const unredProduct = a * b;

	const t = (((unredProduct & rm1) * ctx.baseInv) & rm1) * ctx.base;
	let product = (unredProduct - t) >> ctx.shift;

	if (product >= ctx.base) product -= ctx.base;
	else if (product < ZERO) product += ctx.base;

	return product;
}

/**
 * Calculates `n` to the power of `exp` in Montgomery form.
 * While `n` must be in Montgomery form, `exp` should not.
 *
 * @param {bigint} n A number in Montgomery form; the base of the exponentiation
 * @param {bigint} exp Any number (_not_ in Montgomery form)
 * @param {MontgomeryReductionContext} ctx The Montgomery reduction context to exponentiate within
 * @returns {bigint} The Montgomery-reduced result of taking `n` to exponent `exp`
 */
function montgomeryPow(n, exp, ctx) {
	// Exponentiation by squaring
	const expLen = BigInt(bitLength(exp));
	let result = montgomeryReduce(ONE, ctx);
	for (let i = ZERO, x = n; i < expLen; ++i, x = montgomerySqr(x, ctx)) {
		if (exp & (ONE << i)) result = montgomeryMul(result, x, ctx);
	}

	return result;
}

/** A record class to hold the result of primality testing. */
// class PrimalityResult {
//   /**
//    * Constructs a result object from the given options
//    * @param {PrimalityResultOptions} options
//    */
//   constructor({ probablePrime }) {
//     this.probablePrime = probablePrime
//   }
// }

/**
 * Calculates the gcd of two positive bigints.
 *
 * @param {bigint} a The first number (must be positive)
 * @param {bigint} b The second number (must be positive)
 * @returns {bigint} gcd(a, b)
 */
function ugcd(a, b) {
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

/**
 * Ensures that all bases in the given array are valid for use in Miller-Rabin tests on the number `n = nSub + 1`.
 * A base is valid if it is an integer in the range [2, n-2].
 *
 * If `bases` is null or undefined, it is ignored and null is returned.
 * If `bases` is an array of valid bases, they will be returned as a new array, all coerced to BigInts.
 * Otherwise, a RangeError will be thrown if any of the bases are outside the valid range, or a TypeError will
 * be thrown if `bases` is neither an array nor null/undefined.
 *
 * @param {BigIntResolvable[] | null} bases The array of bases to validate
 * @param {bigint} nSub One less than the number being primality tested
 * @returns {bigint[] | null} An array of BigInts provided all bases were valid, or null if the input was null
 */
function validateBases(bases, nSub) {
	if (bases == null) return null;
	if (!Array.isArray(bases)) throw new TypeError(`invalid bases option (must be an array)`);
	// Ensure all bases are valid BigInts within [2, n-2]
	return bases.map(b => {
		if (typeof b !== "bigint") b = BigInt(b);
		if (!(b >= TWO) || !(b < nSub)) throw new RangeError(`invalid base (must be in the range [2, n-2]): ${b}`);
		return b;
	});
}

/**
 * Computes (p1 * p2) mod modulus for numbers
 * @param {Number} p1 - base
 * @param {Number} p2 - base
 * @param {Number} modulus - modulus
 * @returns - return value: (p1 * p2) % modulus
 */
function modProductNumber(p1, p2, modulus) {
	if (p1 > SAFE_SQRT || p2 > SAFE_SQRT) return Number(( BigInt(p1) * BigInt(p2) ) % BigInt(modulus));
	else return (p1 * p2) % modulus;
}

/**
 * Computes (base ^ 2) mod modulus for numbers
 * @param {Number} base - base
 * @param {Number} modulus - modulus
 * @returns - return value: (base ** 2) % modulus
 */
function modSquaredNumber(base, modulus) {
	if (base > SAFE_SQRT) return Number(( BigInt(base) ** TWO ) % BigInt(modulus));
	else return (base ** 2) % modulus;
}

/**
 * Computes (base ^ exponent) mod modulus for numbers, avoiding recursion because of large exponent
 * @param {Number} base - base
 * @param {Number} exponent - exponent
 * @param {Number} modulus - modulus
 * @returns - return value: (base ** exponent) % modulus
 */
function modPowNumber(base, exponent, modulus) {
	let accumulator = 1;
	while (exponent != 0) {
		if (exponent % 2 == 0) {
			exponent = exponent / 2;
			base = modSquaredNumber(base, modulus);
		} else {
			exponent = exponent - 1;
			accumulator = modProductNumber(base, accumulator, modulus);
		}
	}
	return accumulator;
}

/**
 * Computes (base ^ exponent) mod modulus for BigInts, avoiding recursion because of large exponent
 * @param {bigint} base - base
 * @param {bigint} exponent - exponent
 * @param {bigint} modulus - modulus
 * @returns - return value: (base ** exponent) % modulus
 */
function modPowBigint(base, exponent, modulus) {
	let accumulator = ONE;
	while (exponent != ZERO) {
		if (exponent % TWO == ZERO) {
			exponent = exponent / TWO;
			base = (base ** TWO) % modulus;
		} else {
			exponent = exponent - ONE;
			accumulator = (base * accumulator) % modulus;
		}
	}
	return accumulator;
}

/**
 * Runs Miller-Rabin primality tests on `n` which can be a number, string, or a bigint.
 * If `n` is a number/string smaller than Number.MAX_SAFE_INTEGER, then primalityTestNumber() is called.
 * If `n` is a bigint/string larger than Number.MAX_SAFE_INTEGER, then primalityTestBigint() is called.
 * @param {number|string|bigint} n - A number or bigint integer to be tested for primality.
 * @param {PrimalityTestOptions?} options - optional arguments passed along to primalityTestBigint() if necessary
 * @returns {boolean} true if all the primality tests passed, false otherwise
 */
function primalityTest(n, options) {
	if (typeof n === 'number') return primalityTestNumber(n);
	else if (typeof n === 'string') n = BigInt(n);

	if (n < MAX_SAFE_INTEGER_BIGINT) return primalityTestNumber(Number(n));
	return primalityTestBigint(n, options);
}

/**
 * Runs deterministic Miller-Rabin primality test on number `n`
 * @param {Number} n - A number be tested for primality.
 * @returns {boolean} true if all the primality tests passed, false otherwise
 */
function primalityTestNumber(n) {
	let bases;
	// Handle some small special cases
	if (n < 2) return false; // n = 0 or 1
	else if (n < 4) return true; // n = 2 or 3
	else if (n % 2 == 0) return false; // Quick short-circuit for other even n
	else if (n < LIMIT_2) bases = INT_BASES.slice(0, 1);
	else if (n < LIMIT_2_3) bases = INT_BASES.slice(0, 2);
	else if (n < LIMIT_2_3_5) bases = INT_BASES.slice(0, 3);
	else if (n < LIMIT_2_3_5_7) bases = INT_BASES.slice(0, 4);
	else if (n < LIMIT_2_3_5_7_11) bases = INT_BASES.slice(0, 5);
	else if (n < LIMIT_2_3_5_7_11_13) bases = INT_BASES.slice(0, 6);
	else if (n < LIMIT_2_3_5_7_11_13_17) bases = INT_BASES.slice(0, 7);
	else bases = INT_BASES.slice(0, 9);

	const nSub = n - 1;
	let r = 0;
	let d = nSub;
	while (d % 2 == 0) {
		d = d / 2;
		r += 1;
	}

	for (let round = 0; round < bases.length; round++) {
		const base = bases[round];
    
		// Normal Miller-Rabin method => FAST for smaller numbers!
		const modularpower = modPowNumber(base, d, n);
		if (modularpower != 1) {
			for (let i = 0, x = modularpower;  x != nSub; i += 1, x = modSquaredNumber(x,n)) {
				if (i == r - 1) return false;
			}
		}
	}
  
	return true;
}

/**
 * Runs probabilistic Miller-Rabin primality tests on bigint `n` using randomly-chosen bases, to determine with high probability whether `n` is a prime number.
 *
 * @param {bigint} n A Bigint integer to be tested for primality.
 * @param {PrimalityTestOptions?} options An object specifying the `numRounds` and/or `findDivisor` options.
 *   - `numRounds` is a positive integer specifying the number of random bases to test against.
 *    If none is provided, a reasonable number of rounds will be chosen automatically to balance speed and accuracy.
 *   - `bases` is an array of integers to use as the bases for Miller-Rabin testing. If this option
 *    is specified, the `numRounds` option will be ignored, and the maximum number of testing rounds will equal `bases.length` (one round
 *    for each given base). Every base provided must lie within the range [2, n-2] (inclusive) or a RangeError will be thrown.
 *    If `bases` is specified but is not an array, a TypeError will be thrown.
 *   - `findDivisor` is a boolean specifying whether to calculate and return a divisor of `n` in certain cases where this is
 *    easily possible (not guaranteed). Set this to false to avoid extra calculations if a divisor is not needed. Defaults to `true`.
 *   - `useMontgomery` specifies whether the Montgomery reduction context for faster modular exponentiation should be used.
 *     If left undefined, it is set automatically (recommended).
 * @returns {boolean} true if all the primality tests passed, false otherwise
 */
function primalityTestBigint(
	n,
	{ numRounds, bases, findDivisor = true, useMontgomery} = {}
) {
	// Handle some small special cases
	if (n < TWO) return false; // n = 0 or 1
	else if (n < FOUR) return true; // n = 2 or 3
	else if (!(n & ONE)) return false; // Quick short-circuit for other even n
	else if (n < LIMIT_DETERMINISM) bases = BIGINT_BASES;

	const nBits = bitLength(n);
	const nSub = n - ONE;

	// Represent n-1 as d * 2^r, with d odd
	const r = twoMultiplicity(nSub); // Multiplicity of prime factor 2 in the prime factorization of n-1
	const d = nSub >> r; // The result of factoring out all powers of 2 from n-1

	// Either use the user-provided list of bases to test against, or determine how many random bases to test
	const validBases = validateBases(bases, nSub);
	if (validBases != null) numRounds = validBases.length;
	else if (numRounds == null || numRounds < 1) {
		// If the number of testing rounds was not provided, pick a reasonable one based on the size of n
		// Larger n have a vanishingly small chance to be falsely labelled probable primes, so we can balance speed and accuracy accordingly
		numRounds = getAdaptiveNumRounds(nBits);
	}

	let baseIndex = 0; // Only relevant if the user specified a list of bases to use

	// if useMontgomery is not specified, it will be set according to the cutoff at LOWER_LIMIT_MONTGOMMERY
	if (useMontgomery === undefined) {
		if (n < LOWER_LIMIT_MONTGOMMERY) useMontgomery = false;
		else useMontgomery = true;
	}

	if (useMontgomery) { // Faster for larger numbers (like above 1e30)
		// Convert into a Montgomery reduction context for faster modular exponentiation
		const reductionContext = getReductionContext(n);
		const oneReduced = montgomeryReduce(ONE, reductionContext); // The number 1 in the reduction context
		const nSubReduced = montgomeryReduce(nSub, reductionContext); // The number n-1 in the reduction context

		for (let round = 0; round < numRounds; round++) {
			let base;
			if (validBases != null) {
				// Use the next user-specified base
				base = validBases[baseIndex];
				baseIndex++;
			} else {
				// Select a random base to test
				do {
					base = BigInt("0b" + getRandomBitString(nBits));
				} while (!(base >= TWO) || !(base < nSub)); // The base must lie within [2, n-2]
			}

			// Check whether the chosen base has any factors in common with n (if so, we can end early)
			if (findDivisor) {
				const gcd = ugcd(n, base);
				if (gcd !== ONE) return false; // Found a factor of n, so no need for further primality tests
			}

			const baseReduced = montgomeryReduce(base, reductionContext);
			let x = montgomeryPow(baseReduced, d, reductionContext);
			if (x === oneReduced || x === nSubReduced) continue; // The test passed: base^d = +/-1 (mod n)

			// Perform the actual Miller-Rabin loop
			let i, y;
			for (i = ZERO; i < r; i++) {
				y = montgomerySqr(x, reductionContext);

				if (y === oneReduced) return false; // The test failed: base^(d*2^i) = 1 (mod n) and thus cannot be -1 for any i
				else if (y === nSubReduced) {
					// The test passed: base^(d*2^i) = -1 (mod n) for the current i
					// So n is a strong probable prime to this base (though n may still be composite)
					return true;
				}
				x = y;
			}

			// No value of i satisfied base^(d*2^i) = +/-1 (mod n)
			// So this base is a witness to the guaranteed compositeness of n
			if (i === r) return false;
		}
		return true;
	} else { // Use Miller-Robin method (faster for smaller numbers, like below 1e30)
		for (let round = 0; round < numRounds; round++) {
			let base;
			if (validBases != null) {
				// Use the next user-specified base
				base = validBases[baseIndex];
				baseIndex++;
			} else {
				// Select a random base to test
				do {
					base = BigInt("0b" + getRandomBitString(nBits));
				} while (!(base >= TWO) || !(base < nSub)); // The base must lie within [2, n-2]
			}

			// Check whether the chosen base has any factors in common with n (if so, we can end early)
			if (findDivisor) {
				const gcd = ugcd(n, base);
				if (gcd !== ONE) return false; // Found a factor of n, so no need for further primality tests
			}

			// normal Miller-Rabin
			const modularpower = modPowBigint(base, d, n);
			if (modularpower != ONE) {
				for (let i = ZERO, x = modularpower;  x != nSub; i += ONE, x = (x ** TWO) % n) {
					if (i == r - ONE) return false;
				}
			}
		}
		return true;
	}
}

/**
 * Calculates the length of `n` in bits.
 *
 * @param {bigint} n Any positive integer
 * @returns {number} The number of bits required to encode `n`
 */
function bitLength(n) {
	// Surprisingly, string conversion seems to be the most performant way to get the bit length of a BigInt at present...
	return n.toString(2).length;
}

/**
 * Determines an appropriate number of Miller-Rabin testing rounds to perform based on the size of the
 * input number being tested. Larger numbers generally require fewer rounds to maintain a given level
 * of accuracy.
 *
 * @param {number} inputBits The number of bits in the input number.
 * @returns {number} How many rounds of testing to perform.
 */
function getAdaptiveNumRounds(inputBits) {
	if (inputBits > 1000) return 2;
	else if (inputBits > 500) return 3;
	else if (inputBits > 250) return 4;
	else if (inputBits > 150) return 5;
	else return 6;
}


////////////////////////////////////////////////////////////////////////////////////////////////////////
// Everything below this line is only for testing purposes
////////////////////////////////////////////////////////////////////////////////////////////////////////


// Get the mathjs module via "npm install mathjs"
/*
let mathjs = require('mathjs');

let prime1 = 11;
let prime2 = BigInt("34260522533194312141699016768017376046579370858274371908475849");
let prime3 = BigInt("24609615439855545007865829059894825853255339682863740988001");
let prime4 = BigInt("10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000267");
let largecomposite = prime2*prime3;

function run_basic_tests(){
  console.log("prime1 is prime? " + primalityTest(prime1));
  console.log("prime2 is prime? " + primalityTest(prime2));
  console.log("prime3 is prime? " + primalityTest(prime3));
  console.log("prime4 is prime? " + primalityTest(prime4));
  console.log("Product of prime2 and prime3 is prime? " + primalityTest(largecomposite));
  console.log("Stupidly large composite is prime? " + primalityTest(BigInt("10") ** BigInt("1000") + BigInt("13")));
}
run_basic_tests();

function test_for_errors(){
  let erroramount = 0;
  let N_TESTS = 1000;
  for (let i = 0; i< N_TESTS; i++){
    if (primalityTest(largecomposite)) erroramount++;
  }
  console.log("Consistency test. Number of false positives after " + N_TESTS + " tests: " + erroramount);
}
test_for_errors(largecomposite);

function speed_test(){
  let N_START = 10n**10n;
  let N_STEPS = 10n**5n;
  let timer = Date.now();
  for (let i = N_START; i< N_START + N_STEPS; i+= 1n){
    primalityTest(i, {useMontgomery: false});
  }
  console.log(`Speed test. Time ellapsed: ${(Date.now()-timer)/1000}s`);
}
speed_test();

function mathjs_speed_test(){
  let N_START = 10**10;
  let N_STEPS = 10**5;
  let timer = Date.now();
  for (let i = N_START; i< N_START + N_STEPS; i+= 1){
    mathjs.isPrime(i);
  }
  console.log(`Mathjs speed test. Time ellapsed: ${(Date.now()-timer)/1000}s`);
}
mathjs_speed_test();

// Test this program for correctness with mathjs library
function test_program(){
  let i = 10**12 + 1;
  while(true) {
    let isprime_thisprogram = primalityTest(i);
    let isprime_mathjs = mathjs.isPrime(i);
    if (isprime_thisprogram != isprime_mathjs){
      console.log(`Program fails for number ${i}`);
      console.log(isprime_thisprogram);
      console.log(isprime_mathjs);
      break;
    } else if(i % 10000 == 0){
      console.log(`Numbers up to ${i} tested`);
    }
    i += 1;
  }
}
test_program();
*/


export default {
	primalityTest
};