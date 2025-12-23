/**
 * This module contains methods for working with
 * reading files and creating directories.
 */

import fs from 'fs';
import path from 'path';
import { readdir } from 'node:fs/promises';

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

/**
 * Ensures that the directory for a given file path exists. If the directory
 * does not exist, it will create the necessary parent directories.
 * @param {string} filePath - The path of the file for which the directory should be created.
 */
function ensureDirectoryOfFile(filePath) {
	// Ensure the directory exists
	const dirPath = path.dirname(filePath);
	ensureDirectoryExists(dirPath);
}

/**
 * Writes content to a file, ensuring that all required directories are created.
 * @param {string} filePath - The path to the file
 * @param {string|Buffer} content - The content to write to the file.
 */
function writeFile_ensureDirectory(filePath, content) {
	ensureDirectoryOfFile(filePath); // Ensure the directory exists
	fs.writeFileSync(filePath, content); // Write the file
}

export {
	readFileIfExists,
	ensureDirectoryOfFile,
	ensureDirectoryExists,
	writeFile_ensureDirectory,
};
