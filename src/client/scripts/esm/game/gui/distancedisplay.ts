
// src/client/scripts/esm/game/gui/distancedisplay.ts

import bd, { BigDecimal } from "../../../../../shared/util/bigdecimal/bigdecimal.js";
import bimath from "../../../../../shared/util/bigdecimal/bimath.js";
import boardpos from "../rendering/boardpos.js";
import boardtiles from "../rendering/boardtiles.js";


const element_scale = document.getElementById("scale")!;
const element_x = document.getElementById("xx")!;
const element_y = document.getElementById("yy")!;
const element_width = document.getElementById("width")!;
const element_desc = document.getElementById("desc")!;


export function updateDebugStats(): void {
	const scale = boardpos.getBoardScale();
	element_scale.textContent = formatNumber_StandardizeEPosition(scale, false, 7);

	const boardPos = boardpos.getBoardPos();
	element_x.textContent = formatNumber_StandardizeEPosition(boardPos[0], true, 7);
	element_y.textContent = formatNumber_StandardizeEPosition(boardPos[1], true, 7);

	const boardBoundingBox = boardtiles.gboundingBoxFloat();
	const width = bd.subtract(boardBoundingBox.right, boardBoundingBox.left);
	element_width.textContent = formatNumber_StandardizeEPosition(width, false, 4);

	// element_desc.textContent = getMagnitudeName(bd.toBigInt(bd.floor(width)));

	element_desc.textContent = getMagnitudeNameTens(bd.toBigInt(bd.floor(width)));

	// const maxXY = bd.toBigInt(bd.max(bd.abs(boardPos[0]), bd.abs(boardPos[1])));
	// element_desc.textContent = getMagnitudeNameTens(maxXY);
	// if (element_desc.textContent === '---') element_desc.classList.add('hidden');
	// else element_desc.classList.remove('hidden');
}


/**
 * Formats a BigDecimal number into a scientific notation string with a stable width,
 * ideal for debug displays. It correctly handles numbers of any magnitude.
 *
 * It converts the number to scientific notation (e.g., "1.23e+10") and pads the
 * mantissa (the "1.23" part) so that the "e" always aligns in the same column.
 * If the exponent is zero, the scientific notation is omitted.
 *
 * NOTE: This requires a monospace font in your CSS for the alignment to work.
 *
 * @param num The BigDecimal number to format.
 * @param mantissa_width The target width for the mantissa part of the string.
 * @returns A padded string representation of the number.
 */
function formatNumber_StandardizeEPosition(num: BigDecimal, fixed: boolean, mantissa_width: number): string {
	// 1. Handle the zero case.
	if (bd.isZero(num)) return "0";

	// 2. Separate the sign and work with the absolute value.
	const isNegative = num.bigint < 0n;
	const absBd = bd.abs(num);

	// 3. Calculate the exponent mathematically. This is the most reliable way.
	// floor(log10(123.45)) -> 2.  floor(log10(0.00123)) -> -3.
	const exponent = Math.floor(bd.log10(absBd));

	// 4. Get the full string representation and extract all its digits.
	const s = bd.toString(absBd);
	// "123.45" -> "12345"
	// "0.00987" -> "000987" -> "987"
	const allDigits = s.replace('.', '').replace(/^0+/, '');

	// 5. Construct the mantissa string by placing a decimal after the first digit.
	let mantissaStr = allDigits.substring(0, 1) + '.' + allDigits.substring(1);

	// If the exponent is 0, the mantissa is the actual number string.
	if (exponent === 0 || fixed && exponent < 0) mantissaStr = s;

	// 6. Add the negative sign back if necessary.
	if (isNegative) mantissaStr = '-' + mantissaStr;

	// 7. Truncate the mantissa if it's too long for the desired width.
	if (mantissaStr.length > mantissa_width + (isNegative ? 2 : 1)) mantissaStr = mantissaStr.substring(0, mantissa_width + (isNegative ? 2 : 1));
    
	// 8. Pad the mantissa and conditionally append the formatted exponent.
	let exponentStr = ''; // Default to an empty string
	if (exponent !== 0 && (!fixed || exponent >= 0)) exponentStr = 'e' + (exponent >= 0 ? '+' : '') + exponent;
	
	return mantissaStr.padEnd(mantissa_width + 1, ' ') + exponentStr;
}

/**
 * Takes a number and returns its magnitude's name using a recursive system
 * that can build multi-part names for extremely large numbers.
 *
 * @param num The number to get the name for.
 * @returns The name of the number's magnitude, or "---".
 */
function getMagnitudeName(num: bigint): string {
	if (num < 1000n) return "---";

	const namedNumbers = [
		{ name: "Thousand", power: 3 },
		{ name: "Million", power: 6 },
		{ name: "Billion", power: 9 },
		{ name: "Trillion", power: 12 },
		{ name: "Quadrillion", power: 15 },
		{ name: "Quintillion", power: 18 },
		{ name: "Sextillion", power: 21 },
		{ name: "Septillion", power: 24 },
		{ name: "Octillion", power: 27 },
		{ name: "Nonillion", power: 30 },
		{ name: "Decillion", power: 33 },
		{ name: "Undecillion", power: 36 },
		{ name: "Duodecillion", power: 39 },
		{ name: "Tredecillion", power: 42 },
		{ name: "Quattuordecillion", power: 45 },
		{ name: "Quindecillion", power: 48 },
		{ name: "Sexdecillion", power: 51 },
		{ name: "Septendecillion", power: 54 },
		{ name: "Octodecillion", power: 57 },
		{ name: "Novemdecillion", power: 60 },
		{ name: "Vigintillion", power: 63 },
		{ name: "Googol", power: 100 },
		{ name: "Centillion", power: 303 }
	];

	/**
	 * Recursively builds a magnitude name from a given power.
	 * @param power The power of 10 to name.
	 * @returns The constructed name parts.
	 */
	function buildNameFromPower(power: number): string {
		// Base case: If power is too small to have a name, stop.
		if (power < 3) return "";

		// Find the largest named number that fits within the current power.
		for (let i = namedNumbers.length - 1; i >= 0; i--) {
			const { name, power: basePower } = namedNumbers[i]!;

			if (power >= basePower) {
				const remainingPower = power - basePower;
				
				// Recursively call to get the prefix for the remaining part.
				const prefix = buildNameFromPower(remainingPower);
				
				// Combine the prefix and the current name.
				// If there's a prefix, add a space.
				return prefix ? `${prefix} ${name}` : name;
			}
		}
		return ""; // Should not be reached if power >= 3
	}
	
	const numPower = Math.floor(bimath.log10(num));
	const fullName = buildNameFromPower(numPower);
	const parts = fullName.split(' ');
	
	// If the name has more than one part, pluralize the last part.
	if (parts.length > 1) {
		const lastPart = parts.pop();
		return `${parts.join(' ')} ${lastPart}s`;
	}

	// Otherwise, return the single name as is.
	return fullName || "---";
}


const namedNumbers = [
	{ name: "Thousand", power: 3 },
	{ name: "Million", power: 6 },
	{ name: "Billion", power: 9 },
	{ name: "Trillion", power: 12 },
	{ name: "Quadrillion", power: 15 },
	{ name: "Quintillion", power: 18 },
	{ name: "Sextillion", power: 21 },
	{ name: "Septillion", power: 24 },
	{ name: "Octillion", power: 27 },
	{ name: "Nonillion", power: 30 },
	{ name: "Decillion", power: 33 },
	{ name: "Undecillion", power: 36 },
	{ name: "Duodecillion", power: 39 },
	{ name: "Tredecillion", power: 42 },
	{ name: "Quattuordecillion", power: 45 },
	{ name: "Quindecillion", power: 48 },
	{ name: "Sexdecillion", power: 51 },
	{ name: "Septendecillion", power: 54 },
	{ name: "Octodecillion", power: 57 },
	{ name: "Novemdecillion", power: 60 },
	{ name: "Vigintillion", power: 63 },
	{ name: "Googol", power: 100 },
	{ name: "Centillion", power: 303 },
	{ name: "Ducentillion", power: 603 },
	{ name: "Trecentillion", power: 903 },
	{ name: "Quadringentillion", power: 1203 },
	{ name: "Quingentillion", power: 1503 },
	{ name: "Sescentillion", power: 1803 },
	{ name: "Septingentillion", power: 2103 },
	{ name: "Octingentillion", power: 2403 },
	{ name: "Nongentillion", power: 2703 },
	{ name: "Millinillion", power: 3003 },
	{ name: "Decimillinillion", power: 30003 },
	{ name: "Vigintimillinillion", power: 60003 },
	{ name: "Trigintimillinillion", power: 90003 }
];

/**
 * Takes a number and returns its magnitude's name using a recursive system
 * that can build multi-part names for extremely large numbers,
 * **and** prefixes it with 1, 10, or 100 of the leading unit (rolling
 * over to the next unit at 1000 of any given unit).
 *
 * @param num The number to get the name for.
 * @returns The name of the number's magnitude, or "---".
 */
function getMagnitudeNameTens(num: bigint): string {
	if (num < 1000n) return "---";

	const numPower = Math.floor(bimath.log10(num));

	// 1. Calculate a "default" composite name based on powers of 3.
	// This correctly generates names like "Thousand Vigintillion" (power 66).
	const basePowerOf3 = numPower - (numPower % 3);
	let finalUnitPower = basePowerOf3;
	let finalMagnitudeName = buildNameFromPower(basePowerOf3);

	// 2. Find the largest specific named number (like "Googol") that fits.
	const largestSpecificUnit = [...namedNumbers].reverse().find(unit => numPower >= unit.power);

	// 3. If the specific unit's power is greater, it's a better base.
	if (largestSpecificUnit && largestSpecificUnit.power > finalUnitPower) {
		// e.g., For power 101:
		// - The default power-of-3 base is 99 ("Duodecillion Vigintillion").
		// - The largest specific unit is "Googol" (power 100).
		// - Since 100 > 99, we use "Googol" as the unit instead.
		finalUnitPower = largestSpecificUnit.power;
		finalMagnitudeName = largestSpecificUnit.name;
	}

	// 4. Guard against cases where the number is too small to have a name.
	if (!finalMagnitudeName || finalUnitPower < 3) return "---";

	// 5. Calculate the count based on the final chosen unit.
	const unitValue = 10n ** BigInt(finalUnitPower);
	const count = num / unitValue;

	// return `${count} ${finalMagnitudeName}`;
	return finalMagnitudeName;
}

/**
 * Recursively builds a magnitude name from a given power.
 * @param power The power of 10 to name.
 * @returns The constructed name parts.
 */
function buildNameFromPower(power: number): string {
	// Base case: If power is too small to have a name, stop.
	if (power < 3) return "";

	// Find the largest named number that fits within the current power.
	for (let i = namedNumbers.length - 1; i >= 0; i--) {
		const { name, power: basePower } = namedNumbers[i]!;

		if (power >= basePower) {
			const remainingPower = power - basePower;
			
			// Recursively call to get the prefix for the remaining part.
			const prefix = buildNameFromPower(remainingPower);
			
			// Combine the prefix and the current name.
			// If there's a prefix, add a space.
			return prefix ? `${prefix} ${name}` : name;
		}
	}
	return ""; // Should not be reached if power >= 3
}
