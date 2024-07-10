
/**
 * This script was a draft of creating an arbitrary decimal arithmetic
 * library using BigInts and fixed-point arithmetic.
 * 
 * A more complete library is in the works at:
 * https://github.com/Naviary2/BigDecimal
 */

"use strict";

const bigint = (function(){

    // factor (scaling factor) is the number that the TRUE-bigint has bee multiplied by
    // to get simulated decimal precision!
    // factor = 10^n, where n is the number of decimal precision digits.
    // factor of 1000 is a precision of 3 digits

    // Returns [bigint,factor]
    function newBigInt(value, scalingFactor) { // 15, 100 => [1500, 100]
        const a = BigInt(value);
        const bigInt = a * scalingFactor;
        return [bigInt,scalingFactor];
    }

    // Multiplies and returns a BigInt with the same factor as the first argument!
    function multiply([bigint1, factor1], [bigint2, factor2]) {
        const product = bigint1 * bigint2;

        // If factor2 is not 1n, adjust the product
        if (factor2 !== 1n) {
            return [product / factor2, factor1];
        }

        return [product, factor1];
    }
    
    // Divides and returns a BigInt with the same factor as the first argument!
    function divide([bigint1, factor1], [bigint2, factor2]) {
        const adjustedNumerator = bigint1 * factor2;
        const quotient = adjustedNumerator / bigint2;
        
        return [quotient, factor1];
    }


    function bigIntToString([bigInt, factor]) {

        let string = bigInt.toString();
    
        // If the factor is 1, no need to insert a decimal point
        if (factor === 1n) return string;
    
        const factorLength = factor.toString().length - 1;  // Subtract 1 because '10' has 1 zero, '100' has 2 zeros, etc.
    
        if (string.length <= factorLength) {
            // If the string length is less than or equal to the factor length, pad with zeros and place a decimal at the start
            const padding = '0'.repeat(factorLength - string.length + 1);  // +1 for the '0.' before the number
            return '0.' + padding + string;
        } else {
            // Otherwise, insert a decimal point at the appropriate position
            const integerPart = string.slice(0, -factorLength);
            const decimalPart = string.slice(-factorLength);
            return integerPart + '.' + decimalPart;
        }
    }

    // FASTER version! But gives you less precision, because you are converting to
    // double-precision BEFORE you splice the decimal part off.
    // This still meets my needs for big ints up to 9 trillion with 3 decimal places.
    // After that I will lose precision taking the fast method.
    function bigIntToNumber_MedPrec([bigInt, factor]) { // 15259, 1000 => 15.259
        return Number(bigInt) / Number(factor);
    }

    // MORE PRECISE version, but SLOWER!
    function bigIntToNumber_HighPrec([bigInt, factor]) {
        const decimal = bigInt % factor; // 259
        const decimalPart = Number(decimal) / Number(factor) // 259 / 1000 = 0.259

        const integerBigInt = bigInt / factor; // 15.259 => 15
        const integerPart = Number(integerBigInt) // 15

        return integerPart + decimalPart; // 15 + 0.259 => 15.259
    }

    // Returns log10 of a BigInt! Not sure how precise it is.
    // Pulled from https://stackoverflow.com/questions/70382306/logarithm-of-a-bigint
    // When I need to find the log of a scaling-factor, use howManyDecimalDigitsIsBigInt() instead
    function log10(bigint) {
        if (bigint < 0) return NaN;
        const s = bigint.toString(10);
      
        return s.length + Math.log10("0." + s.substring(0, 15))
    }

    // Returns how many digits of the BigInt represents the decimal part,
    // based on the passed in scalingFactor. This must ALWAYS be an n'th power of 10!
    function getDecimalCountFromScalingFactor(scalingFactor) { // 1 / 10 / 100 / 1000 ...
        const string = scalingFactor.toString(); // 1000 => '1000'
        return string.length - 1;
    }

    return Object.freeze({
        newBigInt,
        multiply,
        divide,
        bigIntToString,
        bigIntToNumber_MedPrec,
        bigIntToNumber_HighPrec,
        log10,
        getDecimalCountFromScalingFactor
    })

})();