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
 * 7. Regular source imports from anywhere else (e.g. src/types/)
 * 8. Side-effect imports
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

// Types -----------------------------------------------------------------------

/** A source directory whose relative imports get their own group. */
type SourceDir = (typeof SOURCE_DIRS)[number]['name'];

/** One import statement, with what decides its group and its place within it. */
interface Import {
	raw: string;
	isType: boolean;
	isPackage: boolean;
	isSideEffect: boolean;
	isMultiLine: boolean;
	lengthBeforeFrom: number;
	/** Which source directory this relative import belongs to, or null if it's a package import or in none of them */
	sourceDir: SourceDir | null;
}

// Constants -------------------------------------------------------------------

/** Regex pattern to match " from " followed by a quote in import statements */
const FROM_WITH_QUOTE_PATTERN = /\sfrom\s+['"]/;

/** The source directories whose relative imports each get their own group, in group order. */
const SOURCE_DIRS = [
	{ name: 'shared', dir: path.resolve(process.cwd(), 'src/shared') },
	{ name: 'client', dir: path.resolve(process.cwd(), 'src/client') },
	{ name: 'tests', dir: path.resolve(process.cwd(), 'src/tests') },
	{ name: 'server', dir: path.resolve(process.cwd(), 'src/server') },
] as const;

// Import Extraction -----------------------------------------------------------

/** Splits a file into its import statements and the text above and below them. */
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
	let hasTsIgnore = false;
	let tsIgnoreLine = '';

	while (i <= boundaries.end) {
		const line = lines[i]!;
		const trimmed = line.trim();

		// Check for @ts-ignore
		if (trimmed.startsWith('// @ts-ignore')) {
			hasTsIgnore = true;
			tsIgnoreLine = line;
			i++;
			if (i > boundaries.end) break;
			continue;
		}

		// Skip empty lines and all comments (except we already handled @ts-ignore)
		if (!trimmed || trimmed.startsWith('//')) {
			i++;
			continue;
		}

		// Skip multi-line comments
		if (trimmed.startsWith('/*')) {
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

			// Collect lines until the last one collected ends the statement
			while (i <= boundaries.end && !doesEndStatement(lines[i - 1]!)) {
				importText += '\n' + lines[i];
				i++;
			}

			if (hasTsIgnore) importText = tsIgnoreLine + '\n' + importText;

			imports.push(parseImport(importText, hasTsIgnore, filePath));

			hasTsIgnore = false;
			tsIgnoreLine = '';
		} else {
			i++;
		}
	}

	return { imports, beforeImports, afterImports };
}

/** The first and last line of the file's import section, or null if it has none. */
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
		// Check for import. Unindented only: an indented one is nested, e.g. in a `declare module` block.
		else if (lines[i]!.startsWith('import ')) {
			if (start === -1) start = i;
			end = i;

			// Multi-line imports run until their statement ends
			while (i < lines.length - 1 && !doesEndStatement(lines[i]!)) {
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

/** Whether a line ends a statement: it has a semicolon outside any `//` comment. */
function doesEndStatement(line: string): boolean {
	return line.split('//')[0]!.includes(';');
}

/** Parses one import statement, with any `@ts-ignore` line above it, into an {@link Import}. */
function parseImport(importText: string, hasTsIgnore: boolean, currentFilePath: string): Import {
	const lines = importText.split('\n');
	const importLine = hasTsIgnore ? lines[lines.length - 1]! : lines[0]!;
	const trimmed = importLine.trim();

	const isType = trimmed.startsWith('import type ') || trimmed.startsWith('import type{');

	// Check if side-effect import (no bindings)
	const isSideEffect = /^import\s+['"][^'"]+['"];?/.test(trimmed);

	const fromMatch = importText.match(/from\s+(['"])(.*?)\1/);
	const fromPath = fromMatch ? fromMatch[2]! : '';
	const isPackage = !!fromPath && !fromPath.startsWith('.') && !fromPath.startsWith('/');

	const sourceDir =
		fromPath && !isPackage ? resolveImportSourceDir(currentFilePath, fromPath) : null;

	// Calculate length before "from" followed by whitespace and a quote
	// For ts-ignore imports, calculate from the import line only, not including the comment
	const textForLength = hasTsIgnore ? importLine : importText;
	const match = FROM_WITH_QUOTE_PATTERN.exec(textForLength);
	const lengthBeforeFrom = match ? match.index : textForLength.length;

	const isMultiLine = importText.includes('\n') && !hasTsIgnore;

	return {
		raw: importText,
		isType,
		isPackage,
		isSideEffect,
		isMultiLine,
		lengthBeforeFrom,
		sourceDir,
	};
}

/** Which source directory a relative import path resolves into, or null if it's in none. */
function resolveImportSourceDir(currentFilePath: string, importPath: string): SourceDir | null {
	const resolved = path.resolve(path.dirname(currentFilePath), importPath);
	// Match whole directories, not string prefixes: src/shared-x is not inside src/shared
	const match = SOURCE_DIRS.find(
		({ dir }) => resolved === dir || resolved.startsWith(dir + path.sep),
	);
	return match?.name ?? null;
}

// Import Sorting --------------------------------------------------------------

/** Arranges the imports into their groups, each sorted, with blank lines between groups. */
function organizeImports(imports: Import[]): string {
	const sideEffectImports = imports.filter((imp) => imp.isSideEffect);
	const typeImports = imports.filter((imp) => !imp.isSideEffect && imp.isType);
	const regularImports = imports.filter((imp) => !imp.isSideEffect && !imp.isType);
	const packageImports = regularImports.filter((imp) => imp.isPackage);
	const sourceImports = regularImports.filter((imp) => !imp.isPackage);
	const sourceGroups = [
		...SOURCE_DIRS.map(({ name }) => sourceImports.filter((imp) => imp.sourceDir === name)),
		sourceImports.filter((imp) => imp.sourceDir === null),
	];

	// Within types: package before source
	typeImports.sort((a, b) => {
		if (a.isPackage !== b.isPackage) return a.isPackage ? -1 : 1;
		return compareImports(a, b);
	});
	for (const group of [packageImports, ...sourceGroups]) {
		group.sort((a, b) => compareImports(a, b));
	}
	sideEffectImports.sort((a, b) => a.raw.length - b.raw.length);

	return [typeImports, packageImports, ...sourceGroups, sideEffectImports]
		.filter((group) => group.length > 0)
		.map((group) => group.map((imp) => imp.raw).join('\n'))
		.join('\n\n');
}

/** Orders two imports of one group: multi-line ones last, then by length before "from". */
function compareImports(a: Import, b: Import): number {
	if (a.isMultiLine !== b.isMultiLine) return a.isMultiLine ? 1 : -1;
	return a.lengthBeforeFrom - b.lengthBeforeFrom;
}

// File Processing -------------------------------------------------------------

/** Rewrites a file with its imports organized, returning whether anything changed. */
function processFile(filePath: string): boolean {
	const content = fs.readFileSync(filePath, 'utf-8');
	const { imports, beforeImports, afterImports } = extractImports(
		content,
		path.resolve(filePath),
	);

	if (imports.length === 0) return false;

	let newContent = '';
	if (beforeImports) newContent = beforeImports.trimEnd() + '\n\n';
	newContent += organizeImports(imports);
	if (afterImports) newContent += '\n\n' + afterImports.trimStart();

	if (content === newContent) return false;
	fs.writeFileSync(filePath, newContent, 'utf-8');
	return true;
}

// Main Execution --------------------------------------------------------------

/** Organizes the imports of every .ts file passed as an argument. */
function main(): void {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error('No files provided. Usage: tsx organize-imports.ts <file1> <file2> ...');
		process.exit(1);
	}

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
