// scripts/modules/srcgraph.ts

/**
 * Source-graph primitives the scripts/modules tools share: walking src/ for scripts,
 * resolving relative specifiers, telling runtime imports from type-only ones, bundling
 * entries as the real client build does, and the short paths every report prints.
 */

import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import esbuild from 'esbuild';

import { ESMResolveOptions } from '../../build/client.js';

// Constants -------------------------------------------------------------------

/** The three src/ roots, each a side of the client/server/shared split. */
const SRC_ROOTS = ['src/shared', 'src/client', 'src/server'];

// Paths -----------------------------------------------------------------------

/** Trims the noisy common prefix so paths read cleanly. */
function short(file: string): string {
	return file.replace(/^src\/client\/scripts\/esm\//, '').replace(/^src\//, '');
}

/** Every .ts/.js file across all three src/ roots. */
function walkSrc(): string[] {
	return SRC_ROOTS.flatMap((root) => walkScripts(root));
}

/** Every .ts/.js file under a directory, as cwd-relative forward-slash paths. */
function walkScripts(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const child = path.posix.join(dir, entry.name);
		if (entry.isDirectory()) walkScripts(child, out);
		else if (/\.(ts|js)$/.test(entry.name)) out.push(child);
	}
	return out;
}

/**
 * Resolves a relative specifier to the file it means — ".js" specifiers point at ".ts" sources.
 * Relative only, which is safe while tsconfig.json declares no `paths`.
 */
function resolveRelative(fromFile: string, specifier: string): string | undefined {
	const base = path.posix.join(path.posix.dirname(fromFile), specifier);
	const candidates = [base.replace(/\.js$/, '.ts'), base];
	return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
}

// Imports ---------------------------------------------------------------------

/** Every specifier a file imports at runtime, static or dynamic — type-only ones are erased. */
function runtimeSpecifiers(file: string, text: string): string[] {
	const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	const specifiers: string[] = [];
	for (const stmt of sf.statements) {
		const specifier = staticSpecifierOf(stmt);
		if (specifier !== undefined) specifiers.push(specifier);
	}
	const visit = (n: ts.Node): void => {
		if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
			const arg = n.arguments[0];
			if (arg && ts.isStringLiteral(arg)) specifiers.push(arg.text);
		}
		n.forEachChild(visit);
	};
	sf.statements.forEach(visit);
	return specifiers;
}

/** The specifier of an import or re-export statement, unless it brings in types alone. */
function staticSpecifierOf(stmt: ts.Statement): string | undefined {
	if (ts.isImportDeclaration(stmt)) {
		const clause = stmt.importClause;
		// `phaseModifier` is also set for `import defer`, which IS a runtime import.
		if (clause?.phaseModifier === ts.SyntaxKind.TypeKeyword) return undefined;
		const named = clause?.namedBindings;
		const allTypes = named && ts.isNamedImports(named) && !clause.name && areAllTypes(named);
		return allTypes ? undefined : literalText(stmt.moduleSpecifier);
	}
	if (ts.isExportDeclaration(stmt)) {
		const named = stmt.exportClause;
		const allTypes =
			stmt.isTypeOnly || (named && ts.isNamedExports(named) && areAllTypes(named));
		return allTypes ? undefined : literalText(stmt.moduleSpecifier);
	}
	return undefined;
}

/** Whether every element of an import or export list is marked `type`. */
function areAllTypes(list: ts.NamedImports | ts.NamedExports): boolean {
	return list.elements.every((el) => el.isTypeOnly);
}

/** A specifier node's text, if it is a plain string literal. */
function literalText(node: ts.Expression | undefined): string | undefined {
	return node && ts.isStringLiteral(node) ? node.text : undefined;
}

// Bundling --------------------------------------------------------------------

/** Bundles client entries in memory, resolving exactly as the real client build does. */
function bundle(
	entryPoints: string[],
	{ minify = false, plugins = [] }: { minify?: boolean; plugins?: esbuild.Plugin[] } = {},
): Promise<esbuild.BuildResult<{ metafile: true; write: false }>> {
	return esbuild.build({
		...ESMResolveOptions,
		entryPoints,
		metafile: true,
		write: false,
		minify,
		logLevel: 'silent',
		outdir: 'srcgraph-virtual-out', // Never written (write: false).
		plugins: [...ESMResolveOptions.plugins, ...plugins],
	});
}

// Exports ---------------------------------------------------------------------

export default {
	// Paths
	short,
	walkSrc,
	walkScripts,
	resolveRelative,
	// Imports
	runtimeSpecifiers,
	// Bundling
	bundle,
};
