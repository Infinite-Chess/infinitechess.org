
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
}

// Parsing Logic -----------------------------------------------------------

function parseImport(importStr: string): Import {
	const trimmed = importStr.trim();
	const isType = trimmed.startsWith('import type ') || trimmed.startsWith('import type{');
	const isMultiLine = importStr.includes('\n');

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

	// Remove 'import type' or 'import' to analyze the rest
	const afterImport = importStr.replace(/^import\s+type\s+/, '').replace(/^import\s+/, '');
	const beforeFrom = afterImport.split(' from ')[0]?.trim() || '';

	// Check for curly braces
	const hasCurlyBraces = beforeFrom.includes('{');
	const hasCommaBeforeCurly =
		beforeFrom.indexOf(',') < beforeFrom.indexOf('{') && beforeFrom.indexOf(',') !== -1;

	if (!hasCurlyBraces) {
		isDefaultOnly = true;
	} else if (hasCommaBeforeCurly) {
		isHybrid = true;
	}

	return {
		raw: importStr,
		isType,
		isPackage,
		isDefaultOnly,
		isHybrid,
		isMultiLine,
		lengthUntilFrom,
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

	// Extract leading comments (before any imports), excluding section headers
	while (i < lines.length) {
		const line = lines[i]!.trim();

		// Skip empty lines at the start
		if (!line) {
			leadingContent += lines[i] + '\n';
			i++;
			continue;
		}

		// Check if it's a section comment header (should be excluded)
		if (
			line.startsWith('//') &&
			(line.toLowerCase().includes('import') ||
				line.toLowerCase().includes('system') ||
				line.toLowerCase().includes('middleware') ||
				line.toLowerCase().includes('custom') ||
				line.toLowerCase().includes('type') ||
				line.toLowerCase().includes('regular') ||
				line.toLowerCase().includes('package'))
		) {
			// Skip section headers - don't include in leading content
			i++;
			continue;
		}

		// Check if it's a comment (not a section header)
		if (
			line.startsWith('//') ||
			line.startsWith('/*') ||
			line.startsWith('*') ||
			line === '*/'
		) {
			leadingContent += lines[i] + '\n';
			i++;
			continue;
		}

		// If we hit an import, stop collecting leading content
		if (line.startsWith('import ')) {
			break;
		}

		// If we hit any other code, stop
		break;
	}

	// Now collect all imports, skipping section comment headers
	while (i < lines.length) {
		const line = lines[i]!.trim();

		// Skip section comment headers
		if (
			line.startsWith('//') &&
			(line.toLowerCase().includes('import') ||
				line.toLowerCase().includes('system') ||
				line.toLowerCase().includes('middleware') ||
				line.toLowerCase().includes('custom') ||
				line.toLowerCase().includes('type') ||
				line.toLowerCase().includes('regular') ||
				line.toLowerCase().includes('package'))
		) {
			i++;
			continue;
		}

		// Skip empty lines between imports
		if (!line) {
			i++;
			continue;
		}

		// Check if it's an import statement
		if (line.startsWith('import ')) {
			foundFirstImport = true;
			let importStr = lines[i]!;
			i++;

			// Handle multi-line imports
			while (i < lines.length && !importStr.includes(';')) {
				importStr += '\n' + lines[i];
				i++;
			}

			imports.push(parseImport(importStr));
			continue;
		}

		// If we found imports and now hit non-import code, collect the rest
		if (foundFirstImport) {
			trailingContent = lines.slice(i).join('\n');
			break;
		}

		// If we haven't found any imports yet, add to leading content
		leadingContent += lines[i] + '\n';
		i++;
	}

	return { imports, leadingContent, trailingContent };
}

function sortImports(imports: Import[]): string {
	// Categorize imports into 4 groups
	const typePackage: Import[] = [];
	const typeSource: Import[] = [];
	const regularPackage: Import[] = [];
	const regularSource: Import[] = [];

	for (const imp of imports) {
		if (imp.isType) {
			if (imp.isPackage) typePackage.push(imp);
			else typeSource.push(imp);
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
	regularPackage.sort(sortFn);
	regularSource.sort(sortFn);

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
	const hasRegularImports = regularPackage.length > 0 || regularSource.length > 0;
	if (hasTypeImports && hasRegularImports) {
		parts.push('');
	}

	// Regular package imports
	if (regularPackage.length > 0) {
		parts.push(regularPackage.map((i) => i.raw).join('\n'));
	}

	// Blank line only if we have both regular package AND regular source
	if (regularPackage.length > 0 && regularSource.length > 0) {
		parts.push('');
	}

	// Regular source imports
	if (regularSource.length > 0) {
		parts.push(regularSource.map((i) => i.raw).join('\n'));
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
