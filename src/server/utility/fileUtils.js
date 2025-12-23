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

/**
 * Ensures that a directory exists, creating it if necessary.
 * @param {string} dirPath - The path to the directory.
 */
function ensureDirectoryExists(dirPath) {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

export { readFileIfExists, ensureDirectoryExists };
