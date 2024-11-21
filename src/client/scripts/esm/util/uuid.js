
/**
 * This script generates unique identifiers for us.
 * 
 * ZERO dependancies.
 */

/**
 * Generates a random ID of the provided length, with the characters 0-9 and a-z.
 * @param {number} length - The length of the desired ID
 * @returns {string} The ID
 */
function generateID(length) {
	let result = '';
	const characters = '0123456789abcdefghijklmnopqrstuvwxyz';
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.random() * charactersLength); // Coerc to an int
	}
	return result;
}

/**
 * Generates a **UNIQUE** ID of the provided length, with the characters 0-9 and a-z.
 * The provided object should contain the keys of the existing IDs.
 * @param {number} length - The length of the desired ID
 * @param {Object} object - The object that contains keys of the existing IDs.
 * @returns {string} The ID
 */
function genUniqueID(length, object) { // object contains the key value list where the keys are the ids we want to not have duplicates of.
	let id;
	do {
		id = generateID(length);
	} while (object[id] !== undefined);
	return id;
}

/**
 * Generates a random numeric ID of the provided length, with the numbers 0-9.
 * @param {number} length - The length of the desired ID
 * @returns {number} The ID
 */
function generateNumbID(length) {
	const zeroOne = Math.random();
	const multiplier = 10 ** length;
	return Math.floor(zeroOne * multiplier);
}

/**
 * Converts a number from base 10 to base 62.
 * @param {number} num - The base 10 number to convert.
 * @returns {string} - The base 62 representation of the number.
 * @throws {Error} - If the input is not a non-negative integer.
 */
function base10ToBase62(num) {
	if (!Number.isInteger(num) || num < 0) {
		throw new Error('Input must be a non-negative integer.');
	}

	const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
	let result = '';

	// Handle zero as a special case
	if (num === 0) return '0';

	while (num > 0) {
		const remainder = num % 62;
		result = characters[remainder] + result;
		num = Math.floor(num / 62);
	}

	return result;
}

/**
 * Converts a number from base 62 to base 10.
 * @param {string} base62Str - The base 62 number to convert.
 * @returns {number} - The base 10 representation of the number.
 * @throws {Error} - If the input contains invalid base 62 characters.
 */
function base62ToBase10(base62Str) {
	if (typeof base62Str !== 'string' || base62Str.length === 0) {
		throw new Error('Input must be a non-empty string.');
	}

	const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
	const base = 62;

	let result = 0;
	for (let i = 0; i < base62Str.length; i++) {
		const char = base62Str[i];
		const value = characters.indexOf(char);

		if (value === -1) {
			throw new Error(`Invalid character '${char}' in base 62 string.`);
		}

		result = result * base + value;
	}

	return result;
}

export default {
	generateID,
	genUniqueID,
	generateNumbID,
	base10ToBase62,
	base62ToBase10,
};