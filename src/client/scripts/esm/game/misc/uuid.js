
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

export default {
	generateID,
	genUniqueID,
	generateNumbID,
};