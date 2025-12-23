/**
 * This module contains methods for working with
 * reading files and creating directories.
 */

import fs from 'fs';

/**
 * Reads a file if it exists, otherwise returns null.
 * @param {string} filePath - The path to the file
 * @returns {Buffer|null} The file contents, or null if the file does not exist.
 */
function readFileIfExists(filePath) {
	return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

export { readFileIfExists };
