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

/** Parses the file's import section, with its first and last line, or returns null if it has none. */
function parseImportSection(
	lines: string[],
	filePath: string,
): { imports: Import[]; start: number; end: number } | null {
	const imports: Import[] = [];
	let start = -1;
	let end = -1;
	/** The latest `@ts-ignore` line not yet attached to an import. */
	let pendingTsIgnore: number | undefined;

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i]!.trim();

		if (trimmed.startsWith('// @ts-ignore')) {
			pendingTsIgnore = i;
			continue;
		}
		if (!trimmed || trimmed.startsWith('//')) continue;
		if (trimmed.startsWith('/*')) {
			while (i < lines.length - 1 && !lines[i]!.includes('*/')) i++;
			continue;
		}
		// Unindented only: an indented import is nested, e.g. in a `declare module` block.
		if (!lines[i]!.startsWith('import ')) {
			if (start !== -1) break; // The first code after the imports ends the section
			continue;
		}

		// Inside the section a @ts-ignore attaches to the next import; above it, only if directly above
		const tsIgnore = start !== -1 || pendingTsIgnore === i - 1 ? pendingTsIgnore : undefined;
		pendingTsIgnore = undefined;

		const statementStart = i;
		while (i < lines.length - 1 && !doesEndStatement(lines[i]!)) i++;

		if (start === -1) start = tsIgnore ?? statementStart;
		end = i;
		const statement = lines.slice(statementStart, i + 1).join('\n');
		imports.push(
			parseImport(statement, tsIgnore === undefined ? undefined : lines[tsIgnore], filePath),
		);
	}

	return start === -1 ? null : { imports, start, end };
}

/** Whether a line ends a statement: it has a semicolon outside any `//` comment. */
function doesEndStatement(line: string): boolean {
	return line.split('//')[0]!.includes(';');
}

/** Parses one import statement, and the `@ts-ignore` line above it if any, into an {@link Import}. */
function parseImport(
	statement: string,
	tsIgnoreLine: string | undefined,
	currentFilePath: string,
): Import {
	const isType = statement.startsWith('import type ') || statement.startsWith('import type{');

	// Check if side-effect import (no bindings)
	const isSideEffect = /^import\s+['"][^'"]+['"];?/.test(statement);

	const fromMatch = statement.match(/from\s+(['"])(.*?)\1/);
	const fromPath = fromMatch ? fromMatch[2]! : '';
	const isPackage = !!fromPath && !fromPath.startsWith('.') && !fromPath.startsWith('/');

	const sourceDir =
		fromPath && !isPackage ? resolveImportSourceDir(currentFilePath, fromPath) : null;

	// Calculate length before "from" followed by whitespace and a quote
	const match = FROM_WITH_QUOTE_PATTERN.exec(statement);
	const lengthBeforeFrom = match ? match.index : statement.length;

	const isMultiLine = statement.includes('\n');

	return {
		raw: tsIgnoreLine === undefined ? statement : tsIgnoreLine + '\n' + statement,
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
	const lines = content.split('\n');
	const section = parseImportSection(lines, path.resolve(filePath));
	if (!section) return false;

	const beforeImports = lines.slice(0, section.start).join('\n');
	const afterImports = lines.slice(section.end + 1).join('\n');

	let newContent = '';
	if (beforeImports) newContent = beforeImports.trimEnd() + '\n\n';
	newContent += organizeImports(section.imports);
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
