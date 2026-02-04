/**
 * TypeScript Import Organizer
 *
 * This script automatically organizes TypeScript import statements according to specific rules.
 * Usage: tsx organize-imports.ts <file1> <file2> ...
 *
 * ========================================
 * IMPORT ORDERING RULES
 * ========================================
 *
 * The script organizes imports into the following groups, in this order:
 *
 * 1. TYPE IMPORTS - PACKAGE
 *    - Type imports from npm packages (paths not starting with . or /)
 *    - Example: import type { Request } from 'express';
 *
 * 2. [blank line if both type package and type source exist]
 *
 * 3. TYPE IMPORTS - SOURCE
 *    - Type imports from local source files (paths starting with . or /)
 *    - Example: import type { User } from './types';
 *
 * 4. [blank line if any type imports exist AND any regular imports exist]
 *
 * 5. REGULAR IMPORTS WITH @ts-ignore - PACKAGE
 *    - Regular imports preceded by @ts-ignore comments, from npm packages
 *    - Example:
 *      // @ts-ignore
 *      import something from 'package';
 *
 * 6. [blank line if both package and source @ts-ignore imports exist]
 *
 * 7. REGULAR IMPORTS WITH @ts-ignore - SOURCE
 *    - Regular imports preceded by @ts-ignore comments, from local files
 *
 * 8. REGULAR IMPORTS - PACKAGE
 *    - Standard imports from npm packages (without @ts-ignore)
 *
 * 9. [blank line if both regular package and regular source exist]
 *
 * 10. REGULAR IMPORTS - SOURCE
 *     - Standard imports from local source files (without @ts-ignore)
 *
 * 11. [blank line if regular imports exist AND side-effect imports exist]
 *
 * 12. SIDE-EFFECT IMPORTS
 *     - Imports that only execute code, no bindings
 *     - Example: import './setup.js';
 *
 * ========================================
 * SORTING WITHIN EACH GROUP
 * ========================================
 *
 * Within each import group, imports are sorted by:
 *
 * 1. Import style (in this order):
 *    a. Default-only imports
 *       Example: import React from 'react';
 *
 *    b. Hybrid imports (default + named or default + namespace)
 *       Example: import React, { useState } from 'react';
 *       Example: import fs, * as path from 'fs';
 *
 *    c. Normal single-line imports (named imports only)
 *       Example: import { useState } from 'react';
 *
 *    d. Multi-line imports (spanning multiple lines)
 *       Example: import {
 *                  useState,
 *                  useEffect
 *                } from 'react';
 *
 * 2. Length of the import statement before "from"
 *    - Shorter imports come before longer imports
 *    - This creates a visually pleasing staircase effect
 *
 * Side-effect imports are sorted only by total length (shortest first).
 *
 * ========================================
 * SPECIAL HANDLING
 * ========================================
 *
 * - File path comments (e.g., // src/server/types.ts) are preserved
 * - Multi-line comment blocks (slash-star ... star-slash) are fully preserved with all internal blank lines
 * - Section divider comments after imports (e.g., // Constants ------) are preserved
 * - Import organization comments (e.g., // System imports, // Import start) are removed
 * - Explanatory comments between imports (e.g., // Import WASM...) are removed
 * - @ts-ignore comments stay attached to their imports
 */

import * as fs from 'fs';
import * as path from 'path';

// Type Definitions --------------------------------------------------------

interface Import {
	raw: string;
	isType: boolean;
	isPackage: boolean;
	isDefaultOnly: boolean;
	isHybrid: boolean;
	isMultiLine: boolean;
	lengthUntilFrom: number;
	hasTsIgnore: boolean;
	isSideEffectOnly: boolean;
}

interface ImportGroups {
	typePackage: Import[];
	typeSource: Import[];
	regularPackageWithTsIgnore: Import[];
	regularSourceWithTsIgnore: Import[];
	regularPackage: Import[];
	regularSource: Import[];
	sideEffectImports: Import[];
}

// Helper Functions --------------------------------------------------------

/**
 * Checks if a comment line is an import-related section header that should be removed.
 * Examples: "// Import start", "// System imports", "// Only imported so their code will run!"
 */
function isImportSectionHeader(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed.startsWith('//')) return false;

	const lower = trimmed.toLowerCase();
	return (
		(lower.includes('import') && (lower.includes('start') || lower.includes('end'))) ||
		lower.includes('system imports') ||
		lower.includes('package imports') ||
		lower.includes('regular imports') ||
		lower.includes('custom imports') ||
		(lower.includes('only imported') && lower.includes('code') && lower.includes('run'))
	);
}

/**
 * Checks if a comment is a section divider that should be preserved.
 * Examples: "// Types -----", "// Constants ===", "// ----"
 */
function isSectionDivider(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed.startsWith('//')) return false;

	// Has repeating dashes or equals (3 or more)
	return /[-=]{3,}/.test(trimmed);
}

/**
 * Determines the import style order for sorting.
 * Returns: 0 (default-only), 1 (hybrid), 2 (normal), 3 (multi-line)
 */
function getImportStyleOrder(imp: Import): number {
	if (imp.isDefaultOnly) return 0;
	if (imp.isHybrid) return 1;
	if (imp.isMultiLine) return 3;
	return 2; // normal single-line
}

/**
 * Comparison function for sorting imports within a group.
 * Sorts by style first, then by length before "from".
 */
function compareImports(a: Import, b: Import): number {
	const styleOrderA = getImportStyleOrder(a);
	const styleOrderB = getImportStyleOrder(b);

	if (styleOrderA !== styleOrderB) {
		return styleOrderA - styleOrderB;
	}

	return a.lengthUntilFrom - b.lengthUntilFrom;
}

/**
 * Adds imports to the output with proper blank line separation.
 */
function addImportGroup(parts: string[], imports: Import[]): void {
	if (imports.length > 0) {
		parts.push(imports.map((i) => i.raw).join('\n'));
	}
}

/**
 * Adds a blank line separator if needed.
 */
function addBlankLineIfNeeded(parts: string[], condition: boolean): void {
	if (condition) {
		parts.push('');
	}
}

// Import Parsing ----------------------------------------------------------

/**
 * Parses a single import statement and extracts its characteristics.
 */
function parseImport(importStr: string, hasTsIgnore: boolean): Import {
	const trimmed = importStr.trim();
	const isType = trimmed.startsWith('import type ') || trimmed.startsWith('import type{');
	const isMultiLine = importStr.includes('\n');

	// Check if it's a side-effect-only import (no bindings)
	const isSideEffectOnly = /^import\s+['"][^'"]+['"];?/.test(trimmed);

	// Determine if it's a package (npm) or source (local file) import
	const fromMatch = importStr.match(/from\s+['"]([^'"]+)['"]/);
	const fromPath = fromMatch ? fromMatch[1]! : '';
	const isPackage = !fromPath.startsWith('.') && !fromPath.startsWith('/');

	// Calculate length until "from" keyword
	const fromIndex = importStr.indexOf(' from ');
	const lengthUntilFrom = fromIndex !== -1 ? fromIndex : importStr.length;

	// Determine import style (default-only, hybrid, or normal)
	let isDefaultOnly = false;
	let isHybrid = false;

	if (!isSideEffectOnly) {
		const afterImport = importStr.replace(/^import\s+type\s+/, '').replace(/^import\s+/, '');
		const beforeFrom = afterImport.split(' from ')[0]?.trim() || '';

		const hasCurlyBraces = beforeFrom.includes('{');
		const hasComma = beforeFrom.includes(',');

		// Check if comma appears before opening curly brace
		const curlyIndex = beforeFrom.indexOf('{');
		const hasCommaBeforeCurly =
			curlyIndex > 0 && beforeFrom.substring(0, curlyIndex).includes(',');

		if (!hasCurlyBraces && !hasComma) {
			isDefaultOnly = true;
		} else if (hasCommaBeforeCurly || (hasComma && !hasCurlyBraces)) {
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

// Import Extraction -------------------------------------------------------

/**
 * Extracts imports from file content, separating them from leading/trailing content.
 */
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

	// Extract leading content (comments, whitespace before imports)
	let inMultiLineComment = false;
	while (i < lines.length) {
		const line = lines[i]!;
		const trimmed = line.trim();

		// Track multi-line comment state to preserve all content within
		if (trimmed.startsWith('/*')) {
			inMultiLineComment = true;
		}
		if (trimmed.endsWith('*/') || trimmed === '*/') {
			leadingContent += line + '\n';
			i++;
			inMultiLineComment = false;
			continue;
		}

		// Preserve everything inside multi-line comments
		if (inMultiLineComment) {
			leadingContent += line + '\n';
			i++;
			continue;
		}

		// Preserve empty lines and comments
		if (!trimmed) {
			leadingContent += line + '\n';
			i++;
			continue;
		}

		// Skip import section headers (they'll be removed)
		if (isImportSectionHeader(trimmed)) {
			i++;
			continue;
		}

		// Preserve regular comments
		if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
			leadingContent += line + '\n';
			i++;
			continue;
		}

		// Stop when we hit an import or other code
		if (trimmed.startsWith('import ')) {
			break;
		}

		break;
	}

	// Extract imports section
	let pendingTsIgnore = false;
	let tsIgnoreLines: string[] = [];
	let consecutiveNonImportLines = 0;

	while (i < lines.length) {
		const line = lines[i]!;
		const trimmed = line.trim();

		// Skip import section headers
		if (isImportSectionHeader(trimmed)) {
			i++;
			consecutiveNonImportLines++;
			continue;
		}

		// Handle @ts-ignore comments
		if (trimmed.startsWith('// @ts-ignore')) {
			tsIgnoreLines.push(line);
			pendingTsIgnore = true;
			i++;
			consecutiveNonImportLines = 0;
			continue;
		}

		// Skip empty lines between imports
		if (!trimmed) {
			i++;
			consecutiveNonImportLines = 0;
			continue;
		}

		// Process import statements
		if (trimmed.startsWith('import ')) {
			foundFirstImport = true;
			consecutiveNonImportLines = 0;
			let importStr = line;
			i++;

			// Collect multi-line import
			while (i < lines.length && !importStr.includes(';')) {
				importStr += '\n' + lines[i];
				i++;
			}

			// Attach @ts-ignore comment if present
			if (pendingTsIgnore) {
				importStr = tsIgnoreLines.join('\n') + '\n' + importStr;
				tsIgnoreLines = [];
			}

			imports.push(parseImport(importStr, pendingTsIgnore));
			pendingTsIgnore = false;
			continue;
		}

		// Check if we've reached the end of imports
		if (foundFirstImport) {
			consecutiveNonImportLines++;

			// Skip single explanatory comments between imports
			if (trimmed.startsWith('//') && !isSectionDivider(trimmed)) {
				if (consecutiveNonImportLines === 1) {
					i++;
					continue;
				}
			}

			// End of imports section - collect remaining content
			trailingContent = lines.slice(i).join('\n');
			break;
		}

		// Still in leading content
		leadingContent += line + '\n';
		i++;
	}

	return { imports, leadingContent, trailingContent };
}

// Import Sorting ----------------------------------------------------------

/**
 * Categorizes imports into their respective groups.
 */
function categorizeImports(imports: Import[]): ImportGroups {
	const groups: ImportGroups = {
		typePackage: [],
		typeSource: [],
		regularPackageWithTsIgnore: [],
		regularSourceWithTsIgnore: [],
		regularPackage: [],
		regularSource: [],
		sideEffectImports: [],
	};

	for (const imp of imports) {
		if (imp.isSideEffectOnly) {
			groups.sideEffectImports.push(imp);
		} else if (imp.isType) {
			if (imp.isPackage) groups.typePackage.push(imp);
			else groups.typeSource.push(imp);
		} else if (imp.hasTsIgnore) {
			if (imp.isPackage) groups.regularPackageWithTsIgnore.push(imp);
			else groups.regularSourceWithTsIgnore.push(imp);
		} else {
			if (imp.isPackage) groups.regularPackage.push(imp);
			else groups.regularSource.push(imp);
		}
	}

	return groups;
}

/**
 * Sorts all import groups and combines them with proper blank line spacing.
 */
function sortImports(imports: Import[]): string {
	const groups = categorizeImports(imports);

	// Sort each group
	groups.typePackage.sort(compareImports);
	groups.typeSource.sort(compareImports);
	groups.regularPackageWithTsIgnore.sort(compareImports);
	groups.regularSourceWithTsIgnore.sort(compareImports);
	groups.regularPackage.sort(compareImports);
	groups.regularSource.sort(compareImports);
	groups.sideEffectImports.sort((a, b) => a.raw.length - b.raw.length);

	// Build output with proper spacing
	const parts: string[] = [];

	// Type imports
	addImportGroup(parts, groups.typePackage);
	addBlankLineIfNeeded(parts, groups.typePackage.length > 0 && groups.typeSource.length > 0);
	addImportGroup(parts, groups.typeSource);

	// Blank line between type and regular imports
	const hasTypeImports = groups.typePackage.length > 0 || groups.typeSource.length > 0;
	const hasRegularImports =
		groups.regularPackageWithTsIgnore.length > 0 ||
		groups.regularSourceWithTsIgnore.length > 0 ||
		groups.regularPackage.length > 0 ||
		groups.regularSource.length > 0;
	addBlankLineIfNeeded(parts, hasTypeImports && hasRegularImports);

	// Regular imports with @ts-ignore (no blank line between these and regular imports)
	addImportGroup(parts, groups.regularPackageWithTsIgnore);
	addBlankLineIfNeeded(
		parts,
		groups.regularPackageWithTsIgnore.length > 0 && groups.regularSourceWithTsIgnore.length > 0,
	);
	addImportGroup(parts, groups.regularSourceWithTsIgnore);

	// Regular imports without @ts-ignore
	addImportGroup(parts, groups.regularPackage);
	addBlankLineIfNeeded(
		parts,
		groups.regularPackage.length > 0 && groups.regularSource.length > 0,
	);
	addImportGroup(parts, groups.regularSource);

	// Side-effect imports
	addBlankLineIfNeeded(parts, hasRegularImports && groups.sideEffectImports.length > 0);
	addImportGroup(parts, groups.sideEffectImports);

	return parts.join('\n');
}

// File Processing ---------------------------------------------------------

/**
 * Processes a single file, organizing its imports if needed.
 * Returns true if the file was modified.
 */
function processFile(filePath: string): boolean {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		const { imports, leadingContent, trailingContent } = extractImports(content);

		if (imports.length === 0) {
			return false; // No imports to organize
		}

		const sortedImports = sortImports(imports);

		// Clean up spacing around imports
		let cleanLeadingContent = leadingContent.trimEnd();
		if (cleanLeadingContent) {
			cleanLeadingContent += '\n\n';
		}

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
	let filesToProcess = process.argv.slice(2);

	if (filesToProcess.length === 0) {
		console.log(
			'[organize-imports] No files provided. Usage: tsx organize-imports.ts <file1> <file2> ...',
		);
		return;
	}

	filesToProcess = filesToProcess.filter((f) => f.endsWith('.ts'));

	let changedCount = 0;
	const rootDir = process.cwd();

	for (const file of filesToProcess) {
		if (!fs.existsSync(file)) continue;
		if (!processFile(file)) continue;

		const relativePath = path.isAbsolute(file) ? path.relative(rootDir, file) : file;
		console.log(relativePath);
		changedCount++;
	}

	if (changedCount > 0) {
		console.log(`Organized imports in ${changedCount} file(s).`);
	}
}

main();
