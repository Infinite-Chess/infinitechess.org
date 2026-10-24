// scripts/modules/orphan-exports.ts

/**
 * Exported symbols, and members of `export default { … }` objects, that nothing outside
 * their own file uses.
 *
 * Usage:
 *   npx tsx scripts/modules/orphan-exports.ts [src/shared | src/server | src/client | any path prefix]
 *
 * Nothing should be exported — types included — without a consumer outside its module, so every
 * hit is either a dead `export` keyword to drop or a symbol whose module is the wrong home.
 *
 * Matching is TEXTUAL — a symbol's name across src/ and scripts/, a member's as
 * `<import>.<member>` in its module's importers — so a name like a common word can hide a real
 * orphan. Treat the output as a candidate list and confirm each one before deleting.
 */

import fs from 'node:fs';
import ts from 'typescript';

import srcgraph from './srcgraph.js';

// Arguments -------------------------------------------------------------------

const target = process.argv[2] ?? 'src/shared';

// Graph -----------------------------------------------------------------------

const allFiles = [...srcgraph.walkSrc(), ...srcgraph.walkScripts('scripts')];
const text = new Map(allFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]));
const parsed = new Map(
	allFiles.map((f) => [f, ts.createSourceFile(f, text.get(f)!, ts.ScriptTarget.Latest, true)]),
);

const scanned = allFiles.filter((f) => f.startsWith(target) && !f.endsWith('.d.ts'));
if (scanned.length === 0) {
	console.error(`No files under "${target}".`);
	process.exit(1);
}

/** module -> its default importers, each with the local name it binds. */
const defaultImports = new Map<string, { importer: string; name: string }[]>();
/** Modules loaded by a dynamic `import()`, whose default export is then read whole. */
const dynamicallyImported = new Set<string>();

for (const f of allFiles) {
	const sf = parsed.get(f)!;
	for (const stmt of sf.statements) {
		if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
		const name = stmt.importClause?.name?.text;
		if (name === undefined) continue;
		const module = srcgraph.resolveRelative(f, stmt.moduleSpecifier.text);
		if (module === undefined) continue;
		defaultImports.set(module, [...(defaultImports.get(module) ?? []), { importer: f, name }]);
	}
	for (const spec of srcgraph.dynamicSpecifiers(sf)) {
		const module = srcgraph.resolveRelative(f, spec);
		if (module !== undefined) dynamicallyImported.add(module);
	}
}

// Top-level exports -----------------------------------------------------------

/** Every top-level symbol this file exports by name. */
function exportedNames(f: string): string[] {
	const names: string[] = [];
	for (const stmt of parsed.get(f)!.statements) {
		// `export { a, b }` carries no export modifier, so it must be matched first.
		if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier) {
			if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
				for (const el of stmt.exportClause.elements) names.push(el.name.text);
			}
			continue;
		}
		const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
		if (!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
		if (ts.isVariableStatement(stmt)) {
			for (const d of stmt.declarationList.declarations) {
				if (ts.isIdentifier(d.name)) names.push(d.name.text);
			}
		} else if (
			(ts.isFunctionDeclaration(stmt) ||
				ts.isClassDeclaration(stmt) ||
				ts.isInterfaceDeclaration(stmt) ||
				ts.isTypeAliasDeclaration(stmt) ||
				ts.isEnumDeclaration(stmt)) &&
			stmt.name
		) {
			names.push(stmt.name.text);
		}
	}
	return names;
}

// Default-object members ------------------------------------------------------

/** The default-object members no importer reads. */
function orphanMembers(f: string): string[] {
	if (dynamicallyImported.has(f)) return [];
	const importers = defaultImports.get(f) ?? [];
	return defaultMembers(f).filter(
		(member) => !importers.some(({ importer, name }) => readsMember(importer, name, member)),
	);
}

/** The member names of this file's `export default { … }` object, if it has one. */
function defaultMembers(f: string): string[] {
	for (const stmt of parsed.get(f)!.statements) {
		if (!ts.isExportAssignment(stmt) || stmt.isExportEquals) continue;
		if (!ts.isObjectLiteralExpression(stmt.expression)) return [];
		return stmt.expression.properties.flatMap((p) =>
			p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? [p.name.text] : [],
		);
	}
	return [];
}

/** Whether an importer reads `member` off the local name it bound the default export to. */
function readsMember(importer: string, name: string, member: string): boolean {
	const source = text.get(importer)!;
	if (new RegExp(`\\b${name}\\s*\\??\\.\\s*${member}\\b`).test(source)) return true;
	// Used whole (passed along, spread, destructured), it could be reading any member.
	const wholeUses = source.match(new RegExp(`\\b${name}\\b(?!\\s*\\??\\.)`, 'g'));
	return (wholeUses?.length ?? 0) > 1; // One is the import itself.
}

// Report ----------------------------------------------------------------------

let total = 0;
for (const f of scanned) {
	const orphans = exportedNames(f).filter((n) => {
		const re = new RegExp(`\\b${n}\\b`);
		return !allFiles.some((o) => o !== f && re.test(text.get(o)!));
	});
	orphans.push(...orphanMembers(f).map((member) => `default.${member}`));
	if (orphans.length === 0) continue;
	total += orphans.length;
	console.log(`${f}: ${orphans.join(', ')}`);
}
console.log(`\n${total} candidate orphan export(s) under ${target}.`);
