
/**
 * This module contains methods for working with
 * reading files and creating directories.
 */

const fs = require('fs');
const path = require('path');

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
 * Writes content to a file, ensuring that all required directories are created.
 * @param {string} filePath - The path to the file
 * @param {string|Buffer} content - The content to write to the file.
 */
function writeFile_ensureDirectory(filePath, content) {
    // Ensure the directory exists
    const dirPath = path.dirname(filePath);
    ensureDirectoryExists(dirPath);

    // Write the file
    fs.writeFileSync(filePath, content);
}

module.exports = {
    readFileIfExists,
    ensureDirectoryExists,
    writeFile_ensureDirectory
};