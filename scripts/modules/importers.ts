// scripts/modules/importers.ts

/**
 * Every importer of a module, across all three src/ roots, marked rt/type.
 *
 * Usage:
 *   npx tsx scripts/modules/importers.ts <substr>
 *
 * The widest-consumer lookup — the CLIENT's home-picking rule. The server and shared pick a
 * home by subject instead, so there this list only proves the ladder isn't broken.
 *
 * Parses with ts.preProcessFile, so `import type` edges COUNT — that is the coupling the
 * ladders exist to catch, and esbuild erases it.
 */

import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';

// Constants -------------------------------------------------------------------

const ROOTS = ['src/shared', 'src/client', 'src/server'];

// Arguments -------------------------------------------------------------------

const target = process.argv[2];
if (target === undefined) {
	console.error('Usage: npx tsx scripts/modules/importers.ts <substr>');
	process.exit(1);
}

// Graph -----------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const child = path.posix.join(dir, e.name);
		if (e.isDirectory()) walk(child, out);
		else if (/\.(ts|js)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(child);
	}
	return out;
}

function resolveSpec(from: string, spec: string): string | undefined {
	const base = path.posix.join(path.posix.dirname(from), spec);
	const cands = [base.replace(/\.js$/, '.ts'), base, `${base}.ts`, `${base}/index.ts`];
	return cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
}

/** Every first-party file, across all three roots — so importers anywhere are seen. */
const allFiles = ROOTS.flatMap((r) => (fs.existsSync(r) ? walk(r) : []));

/** file -> resolved deps */
const deps = new Map<string, Set<string>>();
/** "a->b" for edges carried by at least one non-type-only statement. */
const runtimeEdge = new Set<string>();

for (const f of allFiles) {
	const text = fs.readFileSync(f, 'utf8');
	const set = new Set<string>();
	deps.set(f, set);
	// preProcessFile finds every import/export/dynamic-import specifier, incl. `import type`.
	for (const ref of ts.preProcessFile(text, true, true).importedFiles) {
		if (!ref.fileName.startsWith('.')) continue;
		const r = resolveSpec(f, ref.fileName);
		if (r && r !== f) set.add(r);
	}
	// Classify type-only separately with the AST, which preProcessFile doesn't expose.
	const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
	const record = (spec: string, typeOnly: boolean): void => {
		const r = resolveSpec(f, spec);
		if (!r || r === f) return;
		if (!typeOnly) runtimeEdge.add(`${f}->${r}`);
	};
	for (const stmt of sf.statements) {
		if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
			const clause = stmt.importClause;
			// `phaseModifier` is also set for `import defer`, which IS a runtime import.
			let typeOnly = clause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
			if (!typeOnly && clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name) {
				typeOnly = clause.namedBindings.elements.every((el) => el.isTypeOnly);
			} // prettier-ignore
			record(stmt.moduleSpecifier.text, typeOnly);
		} else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
			let typeOnly = stmt.isTypeOnly;
			if (!typeOnly && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
				typeOnly = stmt.exportClause.elements.every((el) => el.isTypeOnly);
			}
			record(stmt.moduleSpecifier.text, typeOnly);
		} // prettier-ignore
	}
	const visitDynamic = (n: ts.Node): void => {
		if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
			const a = n.arguments[0];
			if (a && ts.isStringLiteral(a) && a.text.startsWith('.')) record(a.text, false);
		}
		n.forEachChild(visitDynamic);
	};
	sf.statements.forEach(visitDynamic);
}

// Report ----------------------------------------------------------------------

const matches = allFiles.filter((f) => f.includes(target));
if (matches.length === 0) {
	console.error(`No file path contains "${target}".`);
	process.exit(1);
}

for (const m of matches) {
	const cons = allFiles.filter((f) => deps.get(f)!.has(m));
	console.log(`\n== ${m}  (${cons.length} consumers)`);
	for (const c of cons.sort()) {
		console.log(`   ${runtimeEdge.has(`${c}->${m}`) ? 'rt  ' : 'type'} ${c}`);
	}
}
