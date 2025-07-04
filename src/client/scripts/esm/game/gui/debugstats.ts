
// src/client/scripts/esm/game/gui/debugstats.ts

import boardpos from "../rendering/boardpos.js";
import boardtiles from "../rendering/boardtiles.js";


const element_scale = document.getElementById("scale")!;
const element_width = document.getElementById("width")!;
const element_desc = document.getElementById("desc")!;



export function updateDebugStats() {
	const scale = boardpos.getBoardScale();
	element_scale.textContent = formatNumber_StandardizeEPosition(scale);

	const boardBoundingBox = boardtiles.gboundingBox();
	const width = boardBoundingBox.right - boardBoundingBox.left;
	element_width.textContent = formatForDisplay(width);

	element_desc.textContent = getMagnitudeName(width);
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
function formatNumber_StandardizeEPosition(num: number): string {
	
	const s = String(num);
	const eIndex = s.indexOf('e');

	// Define fixed widths for padding.
	// A double has ~17 significant digits. Add space for sign, decimal, etc.
	const MANTISSA_WIDTH = 18; 

	if (eIndex !== -1) {
		// Scientific notation (e.g., "1.2345e+20")
		const mantissa = s.substring(0, eIndex);
		const exponent = s.substring(eIndex);
		return mantissa.padEnd(MANTISSA_WIDTH, ' ') + exponent;
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