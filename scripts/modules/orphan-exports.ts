// scripts/modules/orphan-exports.ts

/**
 * Exported symbols with no reference anywhere outside their own file.
 *
 * Usage:
 *   npx tsx scripts/modules/orphan-exports.ts [src/shared | src/server | src/client | any path prefix]
 *
 * Nothing should be exported — types included — without a consumer outside its module, so every
 * hit is either a dead `export` keyword to drop or a symbol whose module is the wrong home.
 *
 * Matching is TEXTUAL across all of src/, so a symbol named like a common word can hide a real
 * orphan. Treat the output as a candidate list and confirm each one before deleting.
 */

import fs from 'node:fs';
import ts from 'typescript';

import srcgraph from './srcgraph.js';

const allFiles = srcgraph.walkSrc();
const text = new Map(allFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]));

const target = process.argv[2] ?? 'src/shared';
const scanned = allFiles.filter((f) => f.startsWith(target) && !f.endsWith('.d.ts'));
if (scanned.length === 0) {
	console.error(`No files under "${target}".`);
	process.exit(1);
}

/** Every top-level symbol this file exports by name. */
function exportedNames(f: string): string[] {
	const sf = ts.createSourceFile(f, text.get(f)!, ts.ScriptTarget.Latest, true);
	const names: string[] = [];
	for (const stmt of sf.statements) {
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

let total = 0;
for (const f of scanned) {
	const orphans = exportedNames(f).filter((n) => {
		const re = new RegExp(`\\b${n}\\b`);
		return !allFiles.some((o) => o !== f && re.test(text.get(o)!));
	});
	if (orphans.length === 0) continue;
	total += orphans.length;
	console.log(`${f}: ${orphans.join(', ')}`);
}
console.log(`\n${total} candidate orphan export(s) under ${target}.`);
