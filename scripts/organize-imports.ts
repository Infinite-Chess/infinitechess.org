// scripts/organize-imports.ts

/**
 * TypeScript Import Organizer
 *
 * PREREQUISITES:
 * - All import statements must end in a semicolon `;`
 *
 * Usage: tsx scripts/organize-imports.ts <file1> <file2> ...
 *
 * Run on all files:
 * npx tsx scripts/organize-imports.ts $(find build src scripts -name "*.ts") *.ts
 *
 * ========================================
 * IMPORT ORGANIZATION RULES
 * ========================================
 *
 * BOUNDARY DETECTION:
 * - Import section starts at the first import statement
 * - Import section ends at the last import statement, or where we encounter the first non-import, non-comment line.
 * - Everything above and below is preserved as-is
 * - All comments within the import boundary (except @ts-ignore, and inline comments on import lines) are deleted
 *
 * GROUPING (groups separated by blank line):
 * 1. Type imports (package and source together, no separation)
 * 2. Regular package imports
 * 3. Regular source imports from shared (src/shared/)
 * 4. Regular source imports from client (src/client/)
 * 5. Regular source imports from tests (src/tests/)
 * 6. Regular source imports from server (src/server/)
 * 7. Side-effect imports
 *
 * SORTING WITHIN GROUPS:
 * - Multi-line imports last
 * - Then by length before "from"
 *
 * SPACING:
 * - One blank line above imports (unless at file top)
 * - One blank line below imports
 * - Blank lines between groups
 */

import * as fs from 'fs';
import * as path from 'path';

// Constants ---------------------------------------------------------------

/** Regex pattern to match " from " followed by a quote in import statements */
const FROM_WITH_QUOTE_PATTERN = /\sfrom\s+['"]/;

/** Path to the shared directory */
const SHARED_DIR = path.resolve(process.cwd(), 'src/shared');
/** Path to the client directory */
const CLIENT_DIR = path.resolve(process.cwd(), 'src/client');
/** Path to the tests directory */
const TESTS_DIR = path.resolve(process.cwd(), 'src/tests');
/** Path to the server directory */
const SERVER_DIR = path.resolve(process.cwd(), 'src/server');

// Type Definitions --------------------------------------------------------

interface Import {
	raw: string;
	isType: boolean;
	isPackage: boolean;
	isSideEffect: boolean;
	isMultiLine: boolean;
	lengthBeforeFrom: number;
	/** Which source directory this relative import belongs to, or null if it's a package import or not in shared/client/tests/server directories */
	sourceDir: 'shared' | 'client' | 'tests' | 'server' | null;
	/** Single-line version of the import (for multi-line imports) */
	singleLineVersion?: string;
}

// Helper Functions --------------------------------------------------------

/**
 * Converts a multi-line import statement to a single line.
 * @param importText - The import statement (potentially multi-line)
 * @returns Single-line version of the import
 */
function convertToSingleLine(importText: string): string {
	// Remove any leading @ts-ignore comments
	const lines = importText.split('\n');
	const importLines = lines.filter((line) => !line.trim().startsWith('// @ts-ignore'));
	
	// Join all import lines and normalize whitespace
	let singleLine = importLines.join(' ').replace(/\s+/g, ' ').trim();
	
	// Ensure there's exactly one space after commas in the import specifiers
	// Match the pattern: import { ... } from '...'
	const importMatch = singleLine.match(/^(import\s+(?:type\s+)?{)(.+?)(}\s+from\s+.+)$/);
	if (importMatch) {
		const [, prefix, specifiers, suffix] = importMatch;
		// Clean up specifiers: remove extra spaces around commas
		const cleanedSpecifiers = specifiers
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0)
			.join(', ');
		singleLine = `${prefix} ${cleanedSpecifiers} ${suffix}`;
	}
	
	return singleLine;
}

/**
 * Resolves an import path from the current file and determines which source directory it belongs to.
 * @param currentFilePath - Absolute path to the file being processed
 * @param importPath - The path from the import statement (e.g., '../../../shared/util/timeutil.js')
 * @returns 'shared', 'client', 'tests', 'server', or null if not in any of these directories
 */
function resolveImportSourceDir(
	currentFilePath: string,
	importPath: string,
): 'shared' | 'client' | 'tests' | 'server' | null {
	// Don't process package imports
	if (!importPath.startsWith('.') && !path.isAbsolute(importPath)) {
		return null;
	}

	// Resolve the import path relative to the current file's directory
	const currentFileDir = path.dirname(currentFilePath);
	const resolvedImportPath = path.resolve(currentFileDir, importPath);

	// Check if the resolved path is within one of our source directories
	// We need to ensure proper directory boundaries (not just string prefix matching)
	const sharedDirWithSep = SHARED_DIR + path.sep;
	const clientDirWithSep = CLIENT_DIR + path.sep;
	const testsDirWithSep = TESTS_DIR + path.sep;
	const serverDirWithSep = SERVER_DIR + path.sep;

	if (resolvedImportPath === SHARED_DIR || resolvedImportPath.startsWith(sharedDirWithSep)) {
		return 'shared';
	} else if (
		resolvedImportPath === CLIENT_DIR ||
		resolvedImportPath.startsWith(clientDirWithSep)
	) {
		return 'client';
	} else if (resolvedImportPath === TESTS_DIR || resolvedImportPath.startsWith(testsDirWithSep)) {
		return 'tests';
	} else if (
		resolvedImportPath === SERVER_DIR ||
		resolvedImportPath.startsWith(serverDirWithSep)
	) {
		return 'server';
	}

	return null;
}

function parseImport(importText: string, hasTsIgnore: boolean, currentFilePath: string): Import {
	const lines = importText.split('\n');
	const importLine = hasTsIgnore ? lines[lines.length - 1]! : lines[0]!;
	const trimmed = importLine.trim();

	// Check if type import
	const isType = trimmed.startsWith('import type ') || trimmed.startsWith('import type{');

	// Check if side-effect import (no bindings)
	const isSideEffect = /^import\s+['"][^'"]+['"];?/.test(trimmed);

	// Determine if package or source
	const fromMatch = importText.match(/from\s+(['"])(.*?)\1/);
	const fromPath = fromMatch ? fromMatch[2]! : '';
	const isPackage = !!fromPath && !fromPath.startsWith('.') && !fromPath.startsWith('/');

	// Determine which source directory the import belongs to
	const sourceDir = isPackage ? null : resolveImportSourceDir(currentFilePath, fromPath);

	// Check if multi-line
	const isMultiLine = importText.includes('\n') && !hasTsIgnore;

	// Generate single-line version for multi-line imports
	let singleLineVersion: string | undefined;
	let lengthBeforeFrom: number;

	if (isMultiLine) {
		// Create single-line version
		singleLineVersion = convertToSingleLine(importText);
		
		// Calculate length from single-line version
		const match = FROM_WITH_QUOTE_PATTERN.exec(singleLineVersion);
		lengthBeforeFrom = match ? match.index : singleLineVersion.length;
	} else {
		// Calculate length before "from" followed by whitespace and a quote
		// For ts-ignore imports, calculate from the import line only, not including the comment
		const textForLength = hasTsIgnore ? importLine : importText;
		const match = FROM_WITH_QUOTE_PATTERN.exec(textForLength);
		lengthBeforeFrom = match ? match.index : textForLength.length;
	}

	return {
		raw: importText,
		isType,
		isPackage,
		isSideEffect,
		isMultiLine,
		lengthBeforeFrom,
		sourceDir,
		singleLineVersion,
	};
}

function compareImports(a: Import, b: Import): number {
	// Sort by length before "from"
	// Note: multi-line imports now have their length calculated from single-line version
	return a.lengthBeforeFrom - b.lengthBeforeFrom;
}

// Import Extraction -------------------------------------------------------

function findImportBoundaries(lines: string[]): { start: number; end: number } | null {
	let start = -1;
	let end = -1;

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i]!.trim();

		// Skip empty lines
		if (!trimmed) continue;
		// Check for comments
		else if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
			continue;
		}
		// Check for import
		else if (trimmed.startsWith('import ')) {
			if (start === -1) start = i;
			end = i;

			// Handle multi-line imports
			// Imports end at a non-commented semicolon
			while (i < lines.length - 1 && !lines[i]!.split('//')[0]!.includes(';')) {
				i++;
				end = i;
			}
		} else {
			// SAFETY STOP: We hit code that is NOT an import and NOT a comment.
			// If we have found an import block already, stop looking.
			if (start !== -1) break;
		}
	}

	return start !== -1 ? { start, end } : null;
}

function extractImports(
	content: string,
	filePath: string,
): {
	imports: Import[];
	beforeImports: string;
	afterImports: string;
} {
	const lines = content.split('\n');
	const boundaries = findImportBoundaries(lines);

	// console.log('Import boundaries:', boundaries);

	if (!boundaries) {
		return {
			imports: [],
			beforeImports: content,
			afterImports: '',
		};
	}

	// Find all @ts-ignore lines before the start
	let actualStart = boundaries.start;
	while (actualStart > 0 && lines[actualStart - 1]!.trim().startsWith('// @ts-ignore')) {
		actualStart--;
	}

	const beforeImports = lines.slice(0, actualStart).join('\n');
	const afterImports = lines.slice(boundaries.end + 1).join('\n');

	// Extract imports within boundaries
	const imports: Import[] = [];
	let i = actualStart;
	let hasTsIgnore = false; // Move outside loop
	let tsIgnoreLine = ''; // Move outside loop

	while (i <= boundaries.end) {
		const line = lines[i]!;
		const trimmed = line.trim();

		// Check for @ts-ignore
		if (trimmed.startsWith('// @ts-ignore')) {
			hasTsIgnore = true;
			tsIgnoreLine = line;
			i++;
			if (i > boundaries.end) break;
			continue; // Continue to next line
		}

		// Skip empty lines and all comments (except we already handled @ts-ignore)
		if (!trimmed || (trimmed.startsWith('//') && !trimmed.startsWith('import '))) {
			i++;
			continue;
		}

		// Skip multi-line comments
		if (trimmed.startsWith('/*') || trimmed.startsWith('/**')) {
			while (i <= boundaries.end && !lines[i]!.includes('*/')) {
				i++;
			}
			i++; // Skip the closing */
			continue;
		}

		// Process import statement
		if (trimmed.startsWith('import ')) {
			let importText = line;
			i++;

			// Collect multi-line import
			// TODO: WHY IS THIS SO WEIRD?!
			// "Stop if the previous line contains a semicolon"?!
			while (i <= boundaries.end && !lines[i - 1]!.split('//')[0]!.includes(';')) {
				importText += '\n' + lines[i]; // Add the next line
				i++;
				// console.log('Collecting multi-line import:', lines[i]);
			}

			// Prepend ts-ignore if present
			if (hasTsIgnore) {
				importText = tsIgnoreLine + '\n' + importText;
			}

			// console.log('Whole import:');
			// console.log(importText);
			// console.log('\n');

			const parsedImport = parseImport(importText, hasTsIgnore, filePath);

			// console.log('Parsed import:', parsedImport, '\n');

			imports.push(parsedImport);

			// Reset ts-ignore flag after using it
			hasTsIgnore = false;
			tsIgnoreLine = '';
		} else {
			i++;
		}
	}

	return { imports, beforeImports, afterImports };
}

// Import Sorting ----------------------------------------------------------

function organizeImports(imports: Import[]): string {
	// Group imports
	const typeImports: Import[] = [];
	const packageImports: Import[] = [];
	const sharedImports: Import[] = [];
	const clientImports: Import[] = [];
	const testsImports: Import[] = [];
	const serverImports: Import[] = [];
	const otherSourceImports: Import[] = []; // For relative imports outside shared/client/tests/server (e.g., from src/types)
	const sideEffectImports: Import[] = [];

	for (const imp of imports) {
		if (imp.isSideEffect) {
			sideEffectImports.push(imp);
		} else if (imp.isType) {
			typeImports.push(imp);
		} else if (imp.isPackage) {
			packageImports.push(imp);
		} else {
			// Source imports - categorize by directory
			if (imp.sourceDir === 'shared') {
				sharedImports.push(imp);
			} else if (imp.sourceDir === 'client') {
				clientImports.push(imp);
			} else if (imp.sourceDir === 'tests') {
				testsImports.push(imp);
			} else if (imp.sourceDir === 'server') {
				serverImports.push(imp);
			} else {
				otherSourceImports.push(imp);
			}
		}
	}

	// Sort each group
	typeImports.sort((a, b) => {
		// Within types: package before source
		if (a.isPackage !== b.isPackage) {
			return a.isPackage ? -1 : 1;
		}
		return compareImports(a, b);
	});

	packageImports.sort(compareImports);
	sharedImports.sort(compareImports);
	clientImports.sort(compareImports);
	testsImports.sort(compareImports);
	serverImports.sort(compareImports);
	otherSourceImports.sort(compareImports);
	sideEffectImports.sort((a, b) => a.raw.length - b.raw.length);

	// Helper function to format an import (add prettier-ignore if it was multi-line)
	const formatImport = (imp: Import): string => {
		if (imp.isMultiLine && imp.singleLineVersion) {
			return `// prettier-ignore\n${imp.singleLineVersion}`;
		}
		return imp.raw;
	};

	// Build groups array
	const groups: string[] = [];

	if (typeImports.length > 0) {
		groups.push(typeImports.map(formatImport).join('\n'));
	}

	if (packageImports.length > 0) {
		groups.push(packageImports.map(formatImport).join('\n'));
	}

	// Add source imports in order: shared, client, tests, server
	if (sharedImports.length > 0) {
		groups.push(sharedImports.map(formatImport).join('\n'));
	}

	if (clientImports.length > 0) {
		groups.push(clientImports.map(formatImport).join('\n'));
	}

	if (testsImports.length > 0) {
		groups.push(testsImports.map(formatImport).join('\n'));
	}

	if (serverImports.length > 0) {
		groups.push(serverImports.map(formatImport).join('\n'));
	}

	// Other source imports that don't belong to shared/client/server
	if (otherSourceImports.length > 0) {
		groups.push(otherSourceImports.map(formatImport).join('\n'));
	}

	if (sideEffectImports.length > 0) {
		groups.push(sideEffectImports.map(formatImport).join('\n'));
	}

	// Join groups with blank lines
	return groups.join('\n\n');
}

// File Processing ---------------------------------------------------------

function processFile(filePath: string): boolean {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		const absoluteFilePath = path.resolve(filePath);
		const { imports, beforeImports, afterImports } = extractImports(content, absoluteFilePath);

		if (imports.length === 0) {
			return false;
		}

		const organizedImports = organizeImports(imports);

		// Build new content
		let newContent = '';

		// Add content before imports
		if (beforeImports) {
			newContent = beforeImports.trimEnd() + '\n\n';
		}

		// Add organized imports
		newContent += organizedImports;

		// Add content after imports
		if (afterImports) {
			newContent += '\n\n' + afterImports.trimStart();
		}

		// Write if changed
		if (content !== newContent) {
			fs.writeFileSync(filePath, newContent, 'utf-8');
			return true;
		}
	} catch (error) {
		console.error(`Error processing ${filePath}:`, error);
	}

	return false;
}

// Main Execution ----------------------------------------------------------

function main(): void {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error('No files provided. Usage: tsx organize-imports.ts <file1> <file2> ...');
		process.exit(1);
	}

	// Filter for only .ts files
	const tsFiles = args.filter((f) => f.endsWith('.ts'));

	let changed = 0;

	for (const file of tsFiles) {
		if (!fs.existsSync(file)) continue;
		if (!processFile(file)) continue;

		const relative = path.isAbsolute(file) ? path.relative(process.cwd(), file) : file;
		console.log(relative);
		changed++;
	}

	if (changed > 0) {
		console.log(`Organized imports in ${changed} file(s).`);
	}
}

main();
