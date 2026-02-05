/**
 * TypeScript Import Organizer
 *
 * Usage: tsx organize-imports-v2.ts <file1> <file2> ...
 *
 * ========================================
 * IMPORT ORGANIZATION RULES
 * ========================================
 *
 * BOUNDARY DETECTION:
 * - Import section starts at the first import statement
 * - Import section ends at the last import statement
 * - Everything above and below is preserved as-is
 * - All comments within the import boundary (except @ts-ignore, and inline comments on import lines) are deleted
 *
 * GROUPING (groups separated by blank line):
 * 1. Type imports (package and source together, no separation)
 * 2. Regular package imports
 * 3. Regular source imports
 * 4. Side-effect imports
 *
 * SORTING WITHIN GROUPS:
 * - @ts-ignore imports first
 * - Default-only imports
 * - Hybrid imports (default + named/namespace)
 * - Regular imports
 * - Multi-line imports
 * - Then by length before "from"
 *
 * SPACING:
 * - One blank line above imports (unless at file top)
 * - One blank line below imports
 * - Blank lines between groups
 */

import * as fs from 'fs';
import * as path from 'path';

// Type Definitions --------------------------------------------------------

interface Import {
	raw: string;
	isType: boolean;
	isPackage: boolean;
	isSideEffect: boolean;
	hasTsIgnore: boolean;
	isDefaultOnly: boolean;
	isHybrid: boolean;
	isMultiLine: boolean;
	lengthBeforeFrom: number;
}

// Helper Functions --------------------------------------------------------

function parseImport(importText: string, hasTsIgnore: boolean): Import {
	const lines = importText.split('\n');
	const importLine = hasTsIgnore ? lines[lines.length - 1]! : lines[0]!;
	const trimmed = importLine.trim();

	// Check if type import
	const isType = trimmed.startsWith('import type ') || trimmed.startsWith('import type{');

	// Check if side-effect import (no bindings)
	const isSideEffect = /^import\s+['"][^'"]+['"];?/.test(trimmed);

	// Determine if package or source
	const fromMatch = importText.match(/from\s+['"]([^'"]+)['"]/);
	const fromPath = fromMatch ? fromMatch[1]! : '';
	const isPackage = !!fromPath && !fromPath.startsWith('.') && !fromPath.startsWith('/');

	// Calculate length before "from" - use full import text for multi-line imports
	const fromIndex = importText.indexOf(' from ');
	const lengthBeforeFrom = fromIndex !== -1 ? fromIndex : importText.length;

	// Check if multi-line
	const isMultiLine = importText.includes('\n') && !hasTsIgnore;

	// Determine import style
	let isDefaultOnly = false;
	let isHybrid = false;

	if (!isSideEffect) {
		const afterImport = importLine.replace(/^import\s+type\s+/, '').replace(/^import\s+/, '');
		const beforeFrom = afterImport.split(' from ')[0]?.trim() || '';

		const hasCurly = beforeFrom.includes('{');
		const hasComma = beforeFrom.includes(',');
		const curlyIndex = beforeFrom.indexOf('{');
		const commaBeforeCurly =
			curlyIndex > 0 && beforeFrom.substring(0, curlyIndex).includes(',');

		if (!hasCurly && !hasComma) {
			isDefaultOnly = true;
		} else if (commaBeforeCurly || (hasComma && !hasCurly)) {
			isHybrid = true;
		}
	}

	return {
		raw: importText,
		isType,
		isPackage,
		isSideEffect,
		hasTsIgnore,
		isDefaultOnly,
		isHybrid,
		isMultiLine,
		lengthBeforeFrom,
	};
}

function compareImports(a: Import, b: Import): number {
	// First: ts-ignore imports come first
	if (a.hasTsIgnore !== b.hasTsIgnore) {
		return a.hasTsIgnore ? -1 : 1;
	}

	// Second: by import style
	const getStyleOrder = (imp: Import): number => {
		if (imp.isDefaultOnly) return 0;
		if (imp.isHybrid) return 1;
		if (imp.isMultiLine) return 3;
		return 2; // regular
	};

	const styleA = getStyleOrder(a);
	const styleB = getStyleOrder(b);

	if (styleA !== styleB) {
		return styleA - styleB;
	}

	// Third: by length before "from"
	return a.lengthBeforeFrom - b.lengthBeforeFrom;
}

// Import Extraction -------------------------------------------------------

function findImportBoundaries(lines: string[]): { start: number; end: number } | null {
	let start = -1;
	let end = -1;

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i]!.trim();

		// Skip @ts-ignore comments when looking for boundaries
		if (trimmed.startsWith('// @ts-ignore')) {
			continue;
		}

		if (trimmed.startsWith('import ')) {
			if (start === -1) {
				start = i;
			}
			end = i;

			// Handle multi-line imports
			while (i < lines.length - 1 && !lines[i]!.includes(';')) {
				i++;
				end = i;
			}
		}
	}

	return start !== -1 ? { start, end } : null;
}

function extractImports(content: string): {
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
			while (i <= boundaries.end && !importText.includes(';')) {
				importText += '\n' + lines[i];
				i++;
			}

			// Prepend ts-ignore if present
			if (hasTsIgnore) {
				importText = tsIgnoreLine + '\n' + importText;
			}

			imports.push(parseImport(importText, hasTsIgnore));

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
	const sourceImports: Import[] = [];
	const sideEffectImports: Import[] = [];

	for (const imp of imports) {
		if (imp.isSideEffect) {
			sideEffectImports.push(imp);
		} else if (imp.isType) {
			typeImports.push(imp);
		} else if (imp.isPackage) {
			packageImports.push(imp);
		} else {
			sourceImports.push(imp);
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
	sourceImports.sort(compareImports);
	sideEffectImports.sort((a, b) => a.raw.length - b.raw.length);

	// Build groups array
	const groups: string[] = [];

	if (typeImports.length > 0) {
		groups.push(typeImports.map((i) => i.raw).join('\n'));
	}

	if (packageImports.length > 0) {
		groups.push(packageImports.map((i) => i.raw).join('\n'));
	}

	if (sourceImports.length > 0) {
		groups.push(sourceImports.map((i) => i.raw).join('\n'));
	}

	if (sideEffectImports.length > 0) {
		groups.push(sideEffectImports.map((i) => i.raw).join('\n'));
	}

	// Join groups with blank lines
	return groups.join('\n\n');
}

// File Processing ---------------------------------------------------------

function processFile(filePath: string): boolean {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		const { imports, beforeImports, afterImports } = extractImports(content);

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
	const files = process.argv.slice(2).filter((f) => f.endsWith('.ts'));

	if (files.length === 0) {
		console.log(
			'[organize-imports] No files provided. Usage: tsx organize-imports.ts <file1> <file2> ...',
		);
		return;
	}

	let changed = 0;
	const cwd = process.cwd();

	for (const file of files) {
		if (!fs.existsSync(file)) continue;
		if (!processFile(file)) continue;

		const relative = path.isAbsolute(file) ? path.relative(cwd, file) : file;
		console.log(relative);
		changed++;
	}

	if (changed > 0) {
		console.log(`Organized imports in ${changed} file(s).`);
	}
}

main();
