/**
 * This organizes TypeScript import statements.
 * Usage: tsx organize-imports.ts <file1> <file2> ...
 */

import * as fs from 'fs';
import * as path from 'path';

interface Import {
	raw: string;
	isType: boolean;
	isPackage: boolean;
	isDefaultOnly: boolean;
	isHybrid: boolean;
	isMultiLine: boolean;
	lengthUntilFrom: number;
	hasTsIgnore: boolean; // Has a @ts-ignore comment above it
	isSideEffectOnly: boolean; // Import with no name (e.g., import './file.js')
}

// Parsing Logic -----------------------------------------------------------

function parseImport(importStr: string, hasTsIgnore: boolean): Import {
	const trimmed = importStr.trim();
	const isType = trimmed.startsWith('import type ') || trimmed.startsWith('import type{');
	const isMultiLine = importStr.includes('\n');

	// Check if it's a side-effect-only import (no name, just a path)
	// Examples: import './file.js'; or import './file.js' (with or without semicolon)
	const isSideEffectOnly = /^import\s+['"][^'"]+['"];?/.test(trimmed);

	// Extract the 'from' part to determine if it's a package or source import
	const fromMatch = importStr.match(/from\s+['"]([^'"]+)['"]/);
	const fromPath = fromMatch ? fromMatch[1]! : '';
	const isPackage = !fromPath.startsWith('.') && !fromPath.startsWith('/');

	// Calculate length until "from"
	const fromIndex = importStr.indexOf(' from ');
	const lengthUntilFrom = fromIndex !== -1 ? fromIndex : importStr.length;

	// Determine import type (default-only, hybrid, normal)
	let isDefaultOnly = false;
	let isHybrid = false;

	if (!isSideEffectOnly) {
		// Remove 'import type' or 'import' to analyze the rest
		const afterImport = importStr.replace(/^import\s+type\s+/, '').replace(/^import\s+/, '');
		const beforeFrom = afterImport.split(' from ')[0]?.trim() || '';

		// Check for curly braces
		const hasCurlyBraces = beforeFrom.includes('{');

		// Check for comma BEFORE the opening curly brace (indicates hybrid)
		// e.g., "default, { named }" or "default, * as namespace"
		const curlyIndex = beforeFrom.indexOf('{');
		const hasCommaBeforeCurly =
			curlyIndex > 0 && beforeFrom.substring(0, curlyIndex).includes(',');

		// Check for comma but no curly braces (indicates "default, * as namespace")
		const hasComma = beforeFrom.includes(',');

		if (!hasCurlyBraces && !hasComma) {
			// Pure default-only import (no curly braces, no comma)
			isDefaultOnly = true;
		} else if (hasCommaBeforeCurly || (hasComma && !hasCurlyBraces)) {
			// Hybrid: either "default, { named }" or "default, * as namespace"
			isHybrid = true;
		}
	}

	return {
		raw: importStr,
		isType,
		isPackage,
		isDefaultOnly,
		isHybrid,
		isMultiLine,
		lengthUntilFrom,
		hasTsIgnore,
		isSideEffectOnly,
	};
}

function extractImports(content: string): {
	imports: Import[];
	leadingContent: string;
	trailingContent: string;
} {
	const lines = content.split('\n');
	let leadingContent = '';
	let trailingContent = '';
	const imports: Import[] = [];

	let i = 0;
	let foundFirstImport = false;

	// Helper function to check if a comment line is an import-related section header
	const isImportSectionHeader = (line: string): boolean => {
		const trimmed = line.trim();
		if (!trimmed.startsWith('//')) return false;

		const lower = trimmed.toLowerCase();

		// Check for typical import section headers
		// Check for typical import section headers that should be removed
		// These are comments specifically about organizing imports, not general code comments
		// Examples: "// Import start", "// System imports", "// Only imported so their code will run!"
		const isImportOrganizationComment =
			(lower.includes('import') && (lower.includes('start') || lower.includes('end'))) ||
			lower.includes('system imports') ||
			lower.includes('package imports') ||
			lower.includes('regular imports') ||
			lower.includes('custom imports') ||
			(lower.includes('only imported') && lower.includes('code') && lower.includes('run'));

		return isImportOrganizationComment;
	};

	// Helper function to check if a comment is a section divider (but not import-related)
	const isSectionDivider = (line: string): boolean => {
		const trimmed = line.trim();
		if (!trimmed.startsWith('//')) return false;

		// Match patterns like:
		// // Types ------------------------------------------------------------------
		// // Type Definitions -----------------------------------------
		// // Constants ----------------------------------------------------------------------
		// // ================================ Type Definitions =================================
		// // --------------------------------------------------------------------------------------

		// Has repeating dashes, equals, or other separator characters (3 or more)
		const hasSeparatorChars = /[-=]{3,}/.test(trimmed);

		// If it's ONLY separators (just dashes/equals), consider it a section divider
		if (/^\/\/\s*[-=]+\s*$/.test(trimmed)) {
			return true;
		}

		// If it has separator chars, it's likely a section divider
		if (hasSeparatorChars) {
			return true;
		}

		return false;
	};

	// Extract leading comments (before any imports)
	let inMultiLineComment = false;
	while (i < lines.length) {
		const line = lines[i]!;
		const trimmed = line.trim();

		// Track multi-line comment state
		if (trimmed.startsWith('/*')) {
			inMultiLineComment = true;
		}
		if (trimmed.endsWith('*/') || trimmed === '*/') {
			leadingContent += line + '\n';
			i++;
			inMultiLineComment = false;
			continue;
		}

		// If we're inside a multi-line comment, keep everything
		if (inMultiLineComment) {
			leadingContent += line + '\n';
			i++;
			continue;
		}

		// Skip empty lines at the start
		if (!trimmed) {
			leadingContent += line + '\n';
			i++;
			continue;
		}

		// Skip import section headers - don't include in leading content
		if (isImportSectionHeader(trimmed)) {
			i++;
			continue;
		}

		// Check if it's a comment (keep these)
		if (
			trimmed.startsWith('//') ||
			trimmed.startsWith('/*') ||
			trimmed.startsWith('*')
		) {
			leadingContent += line + '\n';
			i++;
			continue;
		}

		// If we hit an import, stop collecting leading content
		if (trimmed.startsWith('import ')) {
			break;
		}

		// If we hit any other code, stop
		break;
	}

	// Now collect all imports, handling @ts-ignore comments
	let pendingTsIgnore = false;
	let tsIgnoreLines: string[] = [];
	let consecutiveNonImportLines = 0; // Track consecutive non-import lines

	while (i < lines.length) {
		const line = lines[i]!;
		const trimmed = line.trim();

		// Skip import section headers
		if (isImportSectionHeader(trimmed)) {
			i++;
			consecutiveNonImportLines++; // Count section headers as non-import lines
			continue;
		}

		// Check for @ts-ignore comment
		if (trimmed.startsWith('// @ts-ignore')) {
			tsIgnoreLines.push(line);
			pendingTsIgnore = true;
			i++;
			consecutiveNonImportLines = 0; // Reset because @ts-ignore is part of an import
			continue;
		}

		// Skip empty lines between imports
		if (!trimmed) {
			i++;
			consecutiveNonImportLines = 0; // Empty lines don't count as non-import lines
			continue;
		}

		// Check if it's an import statement
		if (trimmed.startsWith('import ')) {
			foundFirstImport = true;
			consecutiveNonImportLines = 0; // Reset counter when we find an import
			let importStr = line;
			i++;

			// Handle multi-line imports
			while (i < lines.length && !importStr.includes(';')) {
				importStr += '\n' + lines[i];
				i++;
			}

			// If there was a @ts-ignore, prepend it to the import
			if (pendingTsIgnore) {
				importStr = tsIgnoreLines.join('\n') + '\n' + importStr;
				tsIgnoreLines = [];
			}

			imports.push(parseImport(importStr, pendingTsIgnore));
			pendingTsIgnore = false;
			continue;
		}

		// If we found imports and hit a non-import line
		if (foundFirstImport) {
			consecutiveNonImportLines++; // Increment for each non-import line

			// Skip single explanatory comments between imports (like "// Import WASM...")
			// But if we hit a section divider or multiple consecutive non-import lines,
			// we're done with imports
			if (trimmed.startsWith('//') && !isSectionDivider(trimmed)) {
				if (consecutiveNonImportLines === 1) {
					// First non-import comment - skip it (it's likely an explanatory comment)
					i++;
					continue;
				}
			}

			// We've hit the end of the imports section
			trailingContent = lines.slice(i).join('\n');
			break;
		}

		// If we haven't found any imports yet, add to leading content
		leadingContent += line + '\n';
		i++;
	}

	return { imports, leadingContent, trailingContent };
}

function sortImports(imports: Import[]): string {
	// Categorize imports into groups
	const typePackage: Import[] = [];
	const typeSource: Import[] = [];
	const regularPackageWithTsIgnore: Import[] = [];
	const regularSourceWithTsIgnore: Import[] = [];
	const regularPackage: Import[] = [];
	const regularSource: Import[] = [];
	const sideEffectImports: Import[] = [];

	for (const imp of imports) {
		// Side-effect imports go in their own group
		if (imp.isSideEffectOnly) {
			sideEffectImports.push(imp);
		} else if (imp.isType) {
			if (imp.isPackage) typePackage.push(imp);
			else typeSource.push(imp);
		} else if (imp.hasTsIgnore) {
			// Imports with @ts-ignore go in separate groups, above regular imports
			if (imp.isPackage) regularPackageWithTsIgnore.push(imp);
			else regularSourceWithTsIgnore.push(imp);
		} else {
			if (imp.isPackage) regularPackage.push(imp);
			else regularSource.push(imp);
		}
	}

	// Sort function: default-only < hybrid < normal (single-line) < multi-line, then by length
	const sortFn = (a: Import, b: Import): number => {
		// First by style: default-only < hybrid < normal < multi-line
		const getTypeOrder = (imp: Import): number => {
			if (imp.isDefaultOnly) return 0;
			if (imp.isHybrid) return 1;
			if (imp.isMultiLine) return 3;
			return 2; // normal single-line
		};

		const typeOrderA = getTypeOrder(a);
		const typeOrderB = getTypeOrder(b);

		if (typeOrderA !== typeOrderB) {
			return typeOrderA - typeOrderB;
		}

		// Then by length until 'from'
		return a.lengthUntilFrom - b.lengthUntilFrom;
	};

	typePackage.sort(sortFn);
	typeSource.sort(sortFn);
	regularPackageWithTsIgnore.sort(sortFn);
	regularSourceWithTsIgnore.sort(sortFn);
	regularPackage.sort(sortFn);
	regularSource.sort(sortFn);
	// Side-effect imports: sort by length (shortest first)
	sideEffectImports.sort((a, b) => a.raw.length - b.raw.length);

	// Build output with proper blank line rules
	const parts: string[] = [];

	// Type package imports
	if (typePackage.length > 0) {
		parts.push(typePackage.map((i) => i.raw).join('\n'));
	}

	// Blank line only if we have both type package AND type source
	if (typePackage.length > 0 && typeSource.length > 0) {
		parts.push('');
	}

	// Type source imports
	if (typeSource.length > 0) {
		parts.push(typeSource.map((i) => i.raw).join('\n'));
	}

	// Blank line only if we have any type imports AND any regular imports
	const hasTypeImports = typePackage.length > 0 || typeSource.length > 0;
	const hasRegularImports =
		regularPackageWithTsIgnore.length > 0 ||
		regularSourceWithTsIgnore.length > 0 ||
		regularPackage.length > 0 ||
		regularSource.length > 0;
	if (hasTypeImports && hasRegularImports) {
		parts.push('');
	}

	// Regular imports with @ts-ignore - package first
	if (regularPackageWithTsIgnore.length > 0) {
		parts.push(regularPackageWithTsIgnore.map((i) => i.raw).join('\n'));
	}

	// Blank line between package and source ts-ignore imports
	if (regularPackageWithTsIgnore.length > 0 && regularSourceWithTsIgnore.length > 0) {
		parts.push('');
	}

	// Regular imports with @ts-ignore - source
	if (regularSourceWithTsIgnore.length > 0) {
		parts.push(regularSourceWithTsIgnore.map((i) => i.raw).join('\n'));
	}

	// NO blank line between ts-ignore imports and regular imports - they're in the same group

	// Regular package imports (without @ts-ignore)
	if (regularPackage.length > 0) {
		parts.push(regularPackage.map((i) => i.raw).join('\n'));
	}

	// Blank line only if we have both regular package AND regular source
	if (regularPackage.length > 0 && regularSource.length > 0) {
		parts.push('');
	}

	// Regular source imports (without @ts-ignore)
	if (regularSource.length > 0) {
		parts.push(regularSource.map((i) => i.raw).join('\n'));
	}

	// Blank line before side-effect imports if we have regular imports
	if (hasRegularImports && sideEffectImports.length > 0) {
		parts.push('');
	}

	// Side-effect imports at the end
	if (sideEffectImports.length > 0) {
		parts.push(sideEffectImports.map((i) => i.raw).join('\n'));
	}

	return parts.join('\n');
}

function processFile(filePath: string): boolean {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		const { imports, leadingContent, trailingContent } = extractImports(content);

		if (imports.length === 0) {
			return false; // No imports to organize
		}

		const sortedImports = sortImports(imports);

		// Remove trailing newlines from leading content
		let cleanLeadingContent = leadingContent.trimEnd();
		if (cleanLeadingContent) {
			cleanLeadingContent += '\n\n';
		}

		// Remove leading newlines from trailing content
		let cleanTrailingContent = trailingContent.trimStart();
		if (cleanTrailingContent) {
			cleanTrailingContent = '\n\n' + cleanTrailingContent;
		}

		const newContent = cleanLeadingContent + sortedImports + cleanTrailingContent;

		// Only write if content changed
		if (content !== newContent) {
			fs.writeFileSync(filePath, newContent, 'utf-8');
			return true;
		}
	} catch (error) {
		console.error(`Error processing file ${filePath}:`, error);
	}

	return false;
}

// Main Execution ----------------------------------------------------------

function main(): void {
	// Get arguments from the command line (excluding 'node' and script path)
	let filesToProcess = process.argv.slice(2);

	if (filesToProcess.length === 0) {
		// If no arguments passed, do nothing (or print help)
		console.log(
			'[organize-imports] No files provided. Usage: tsx organize-imports.ts <file1> <file2> ...',
		);
		return;
	}

	filesToProcess = filesToProcess.filter((f) => f.endsWith('.ts')); // Filter only .ts files

	let changedCount = 0;
	const rootDir = process.cwd();

	for (const file of filesToProcess) {
		if (!fs.existsSync(file)) continue; // Deleted but still staged
		if (!processFile(file)) continue; // No changes made
		// Output relative path for cleaner logs
		const relativePath = path.isAbsolute(file) ? path.relative(rootDir, file) : file;
		console.log(relativePath);
		changedCount++;
	}

	if (changedCount > 0) {
		console.log(`Organized imports in ${changedCount} file(s).`);
	}
}

main();
