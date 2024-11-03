
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

/**
 * Recursively retrieves all files with a specific extension from a directory and its subdirectories.
 * @param {string} path - The directory path where the search will start.
 * @param {string} ext - The file extension to filter by (e.g., '.js', '.txt').
 * @returns {Promise<string[]>} - A promise that resolves to an array of file paths with the specified extension.
 */
async function getAllFilesInDirectoryWithExtension(path, ext) {
	const filesNFolder = await readdir(path);
	const folders = filesNFolder.filter(v => !v.endsWith(ext));
	const files = filesNFolder.filter(v => v.endsWith(ext));

	for (const folder of folders) {
		try {
			const newFiles = await getAllFilesInDirectoryWithExtension(`${path}/${folder}`, ext);
			files.push(...newFiles.map(v => `${folder}/${v}`));
		} catch (e) {
			if (e.code) continue;
			console.log(e);
		}
	}

	return files;
}

export {
	readFileIfExists,
	ensureDirectoryOfFile,
	ensureDirectoryExists,
	writeFile_ensureDirectory,
	getAllFilesInDirectoryWithExtension,
};