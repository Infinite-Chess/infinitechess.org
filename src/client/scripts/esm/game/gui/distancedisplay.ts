
// src/client/scripts/esm/game/gui/distancedisplay.ts

import jsutil from "../../util/jsutil.js";
import selection from "../chess/selection.js";
import boardpos from "../rendering/boardpos.js";
import boardtiles from "../rendering/boardtiles.js";


const element_scale = document.getElementById("scale")!;
const element_x = document.getElementById("xx")!;
const element_y = document.getElementById("yy")!;
const element_width = document.getElementById("width")!;
const element_desc = document.getElementById("desc")!;
const element_selected = document.getElementById("selected")!;
const element_legal = document.getElementById("legal")!;



export function updateDebugStats() {
	const scale = boardpos.getBoardScale();
	element_scale.textContent = formatNumber_StandardizeEPosition(scale);

	const boardPos = boardpos.getBoardPos();
	element_x.textContent = String(boardPos[0]);
	element_y.textContent = String(boardPos[1]);

	// const boardBoundingBox = boardtiles.gboundingBox();
	// const width = boardBoundingBox.right - boardBoundingBox.left;
	// element_width.textContent = formatForDisplay(width);

	// element_desc.textContent = getMagnitudeName(width);

	const maxXY = Math.max(Math.abs(boardPos[0]), Math.abs(boardPos[1]));
	element_desc.textContent = getMagnitudeNameTens(maxXY);
	if (element_desc.textContent === '---') element_desc.classList.add('hidden');
	else element_desc.classList.remove('hidden');

	const selectedPiece = selection.getPieceSelected() ?? null;
	element_selected.textContent = selectedPiece ? JSON.stringify(selectedPiece.coords) : 'null';

	const legalMoves = jsutil.deepCopyObject(selection.getLegalMovesOfSelectedPiece());
	// @ts-ignore
	if (legalMoves?.individual.length === 0) delete legalMoves.individual;
	// @ts-ignore
	if (legalMoves?.sliding && Object.keys(legalMoves.sliding).length === 0) delete legalMoves.sliding;
	element_legal.textContent = legalMoves ? stringifyWithInfinity(legalMoves) : 'null';
}


/**
 * Formats a number into a string with a stable width, ideal for debug displays.
 * It preserves the number's full precision while preventing UI layout shifts.
 * 
 * - If the number is in scientific notation (e.g., "1.23e+10"), it pads the
 *   mantissa (the "1.23" part) so that the "e" always aligns.
 * - If the number is in standard notation, it pads the entire string.
 *
 * NOTE: This requires a monospace font in your CSS for the alignment to work.
 *
 * @param num The number to format.
 * @returns A padded string representation of the number.
 */
function formatNumber_StandardizeEPosition(num: number, mantissa_width = 18): string {
	
	const s = String(num);
	const eIndex = s.indexOf('e');

	// Define fixed widths for padding.
	// A double has ~17 significant digits. Add space for sign, decimal, etc.
	// const mantissa_width = 18; 

	if (eIndex !== -1) {
		// Scientific notation (e.g., "1.2345e+20")
		const mantissa = s.substring(0, eIndex);
		const exponent = s.substring(eIndex);
		return mantissa.padEnd(mantissa_width, ' ') + exponent;
	} else return s;
}

/**
 * Formats a number for "pleasing" display with a BUILT-IN precision of 5.
 * Ideal for values like screen width that don't need full accuracy.
 */
function formatForDisplay(num: number | undefined): string {
	if (num === undefined || num === null || isNaN(num)) {
		return "---".padEnd(15, ' ');
	}

	return num.toPrecision(4);
}

/**
 * Takes a number and returns its magnitude's name using a recursive system
 * that can build multi-part names for extremely large numbers.
 *
 * @param num The number to get the name for.
 * @returns The name of the number's magnitude, or "---".
 */
function getMagnitudeName(num: number | undefined): string {
	if (num === undefined || num === null || isNaN(num) || !isFinite(num) || num < 1000) {
		return "---";
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
		{ name: "Centillion", power: 303 }
	];

	/**
	 * Recursively builds a magnitude name from a given power.
	 * @param power The power of 10 to name.
	 * @returns The constructed name parts.
	 */
	function buildNameFromPower(power: number): string {
		// Base case: If power is too small to have a name, stop.
		if (power < 3) {
			return "";
		}

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
	
	const numPower = Math.floor(Math.log10(num));
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
	{ name: "Centillion", power: 303 }
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
function getMagnitudeNameTens(num: number | undefined): string {
	if (num === undefined || num === null || isNaN(num) || !isFinite(num) || num < 1000) {
		return "---";
	}

	const numPower = Math.floor(Math.log10(num));

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
	if (!finalMagnitudeName || finalUnitPower < 3) {
		return "---";
	}

	// 5. Calculate the count based on the final chosen unit.
	const unitValue = Math.pow(10, finalUnitPower);
	const count = Math.floor(num / unitValue);

	return `${count} ${finalMagnitudeName}`;
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


/**
 * A JSON-stringify wrapper that preserves ±Infinity as strings.
 * 
 * @param value     The value to serialize.
 * @param replacer  An optional replacer function or array, just like JSON.stringify.
 * @param space     An optional space argument for pretty‑printing.
 * @returns         A JSON string where any Number.POSITIVE_INFINITY
 *                  becomes "Infinity" and Number.NEGATIVE_INFINITY
 *                  becomes "-Infinity".
 */
export function stringifyWithInfinity(
	value: any,
	replacer?: ((this: any, key: string, value: any) => any) | (string | number)[] | null,
	space?: string | number
): string {
	// our replacer will run before the user-provided replacer (if any)
	function infinityReplacer(this: any, key: string, val: any): any {
		if (typeof val === "number") {
			if (val === Infinity)  return "Infinity";
			if (val === -Infinity) return "-Infinity";
		}
		return val;
	}

	// compose replacers: first handle Infinity, then pass through user replacer
	const combinedReplacer = 
    typeof replacer === "function" ? (key: string, val: any) => {
		// @ts-ignore
		const afterInf = infinityReplacer.call(this, key, val);
		// @ts-ignore
		return replacer.call(this, key, afterInf);
    } : (key: string, val: any) => {
		// @ts-ignore
      	const afterInf = infinityReplacer.call(this, key, val);
      	// if replacer is an array, let JSON.stringify filter by it
      	return afterInf;
	};

	return JSON.stringify(value, combinedReplacer as any, space);
}