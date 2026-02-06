// scripts/add-file-paths.ts

/**
 * This script ensures all .js and .ts files have their relative file path
 * on the first line in the format: `// <relative-path>`
 * followed by an empty line.
 *
 * It intelligently detects existing path comments (correct or incorrect)
 * and updates them as needed to avoid duplicates.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

/**
 * Checks if a line looks like a file path comment.
 * Returns the path if it matches the pattern, otherwise null.
 */
function extractPathFromComment(line: string): string | null {
	const match = line.match(/^\/\/\s*(.+)$/);
	if (!match || !match[1]) return null;

	const content = match[1].trim();
	// Check if it looks like a file path (contains / or \ and ends with .ts or .js)
	if (content.match(/[/\\].*\.(ts|js)$/)) {
		return content;
	}
	return null;
}

/**
 * Processes a single file to ensure it has the correct path comment.
 */
function processFile(filePath: string): void {
	const content = readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');

	// Calculate the correct relative path from repo root
	const repoRoot = process.cwd();
	const absolutePath = resolve(filePath);
	const relativePath = relative(repoRoot, absolutePath);
	const correctPath = relativePath.replace(/\\/g, '/');
	const correctComment = `// ${correctPath}`;

	// Check the first line
	const firstLine = lines[0] || '';
	const existingPath = extractPathFromComment(firstLine);

	// Determine what changes are needed
	let needsUpdate = false;
	let newLines: string[];

	if (existingPath === null) {
		// No path comment exists on line 1
		// Check if line 1 is empty and line 2 might have a path comment
		if (firstLine === '' && lines.length > 1) {
			const secondLinePath = extractPathFromComment(lines[1] || '');
			if (secondLinePath !== null) {
				// There's an empty line followed by a path comment - fix it
				lines.shift(); // Remove the empty first line
				if (secondLinePath !== correctPath) {
					// Incorrect path on line 2 (now line 1)
					lines[0] = correctComment;
					needsUpdate = true;
				}
				// Ensure empty line after path
				if (lines.length < 2 || lines[1] !== '') {
					lines.splice(1, 0, '');
					needsUpdate = true;
				}
				newLines = lines;
			} else {
				// Empty first line but no path comment - add path comment at the beginning
				newLines = [correctComment, '', ...lines];
				needsUpdate = true;
			}
		} else {
			// No path comment at all - add it at the beginning
			newLines = [correctComment, '', ...lines];
			needsUpdate = true;
		}
	} else {
		// Path comment exists on line 1
		if (existingPath !== correctPath) {
			// Incorrect path - update it
			lines[0] = correctComment;
			needsUpdate = true;
		}

		// Ensure there's an empty line after the path comment
		if (lines.length < 2 || lines[1] !== '') {
			lines.splice(1, 0, '');
			needsUpdate = true;
		}

		newLines = lines;
	}

	// Write the file if changes were made
	if (needsUpdate) {
		const newContent = newLines.join('\n');
		writeFileSync(filePath, newContent, 'utf-8');
		console.log(`Updated: ${filePath}`);
	}
}

/**
 * Main entry point for the script.
 */
function main(): void {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error('Error: No files specified');
		console.error('Usage: tsx scripts/add-file-paths.ts <file1> <file2> ...');
		process.exit(1);
	}

	// Filter for only .js and .ts files
	const jsAndTsFiles = args.filter((file) => file.match(/\.(js|ts)$/));

	if (jsAndTsFiles.length === 0) {
		console.log('No .js or .ts files to process');
		return;
	}

	console.log(`Processing ${jsAndTsFiles.length} file(s)...`);

	for (const file of jsAndTsFiles) {
		try {
			processFile(file);
		} catch (error) {
			console.error(`Error processing ${file}:`, error);
			process.exit(1);
		}
	}

	console.log('Done!');
}

main();
