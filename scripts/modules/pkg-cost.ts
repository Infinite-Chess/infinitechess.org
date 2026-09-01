// scripts/modules/pkg-cost.ts

/**
 * Which client pages bundle an npm package, why, and what it costs them.
 *
 * Usage:
 *   npx tsx scripts/modules/pkg-cost.ts [pkg] [--why] [--cost]
 *
 * Defaults to zod. --why prints the shortest import chain pulling it in; --cost bundles each
 * entry twice, once with the package stubbed empty, and diffs the minified bytes.
 *
 * A heavy package is a placement constraint of its own — zod alone is ~60 KB. Before relocating
 * a schema, check its new home is reached only by pages already carrying it. Type-only imports
 * are skipped throughout, since esbuild erases them.
 */

import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import esbuild from 'esbuild';

import { ESMEntryPoints } from '../../build/client.js';

function resolveSpec(from: string, spec: string): string | undefined {
	const base = path.posix.join(path.posix.dirname(from), spec);
	const cands = [base.replace(/\.js$/, '.ts'), base, `${base}.ts`, `${base}/index.ts`];
	return cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
}

const depCache = new Map<string, { local: string[]; bare: string[] }>();
function depsOf(f: string): { local: string[]; bare: string[] } {
	if (depCache.has(f)) return depCache.get(f)!;
	const text = fs.readFileSync(f, 'utf8');
	const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
	const local: string[] = [];
	const bare: string[] = [];
	const add = (spec: string, typeOnly: boolean): void => {
		if (typeOnly) return; // erased by esbuild — never bundled
		if (spec.startsWith('.')) {
			const r = resolveSpec(f, spec);
			if (r) local.push(r);
		} else bare.push(spec);
	};
	for (const stmt of sf.statements) {
		if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
			const c = stmt.importClause;
			let typeOnly = false;
			// `phaseModifier` is also set for `import defer`, which IS a runtime import.
			if (c?.phaseModifier === ts.SyntaxKind.TypeKeyword) typeOnly = true;
			else if (c?.namedBindings && ts.isNamedImports(c.namedBindings) && !c.name)
				typeOnly = c.namedBindings.elements.every((el) => el.isTypeOnly);
			add(stmt.moduleSpecifier.text, typeOnly);
		} else if (
			ts.isExportDeclaration(stmt) &&
			stmt.moduleSpecifier &&
			ts.isStringLiteral(stmt.moduleSpecifier)
		) {
			let typeOnly = stmt.isTypeOnly;
			if (!typeOnly && stmt.exportClause && ts.isNamedExports(stmt.exportClause))
				typeOnly = stmt.exportClause.elements.every((el) => el.isTypeOnly);
			add(stmt.moduleSpecifier.text, typeOnly);
		}
	}
	const visit = (n: ts.Node): void => {
		if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
			const a = n.arguments[0];
			if (a && ts.isStringLiteral(a)) add(a.text, false);
		}
		n.forEachChild(visit);
	};
	sf.statements.forEach(visit);
	const r = { local, bare };
	depCache.set(f, r);
	return r;
}

/** BFS from an entry; returns the shortest path to a file importing `pkg`, or undefined. */
function pathToPackage(entry: string, pkg: string): string[] | undefined {
	const seen = new Set([entry]);
	const queue: string[][] = [[entry]];
	while (queue.length) {
		const trail = queue.shift()!;
		const f = trail[trail.length - 1]!;
		const { local, bare } = depsOf(f);
		if (bare.some((b) => b === pkg || b.startsWith(`${pkg}/`))) return trail;
		for (const d of local) {
			if (seen.has(d)) continue;
			seen.add(d);
			queue.push([...trail, d]);
		}
	}
	return undefined;
}

/** Replaces `pkg` with an empty module, so its bytes drop out of the bundle. */
function stubPackage(pkg: string): esbuild.Plugin {
	return {
		name: 'stub-pkg',
		setup(build) {
			build.onResolve({ filter: new RegExp(`^${pkg}(/|$)`) }, () => ({ path: pkg, namespace: 'stub' }));
			build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export {};' }));
		},
	}; // prettier-ignore
}

/** Minified byte size of one entry's bundle, optionally with `pkg` stubbed out. */
async function sizeOf(entry: string, stub: string | undefined): Promise<number> {
	const result = await esbuild.build({
		entryPoints: [entry],
		bundle: true,
		minify: true,
		write: false,
		logLevel: 'silent',
		format: 'esm',
		loader: { '.wasm': 'file', '.glsl': 'text' },
		external: ['/fonts/*'],
		outdir: 'pkg-cost-virtual-out', // Never written (write: false).
		plugins: stub ? [stubPackage(stub)] : [],
	});
	return result.outputFiles!.reduce((n, f) => n + f.contents.byteLength, 0);
}

const args = process.argv.slice(2);
const why = args.includes('--why');
const cost = args.includes('--cost');
const pkg = args.find((a) => !a.startsWith('--')) ?? 'zod';
const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;

const scripts = ESMEntryPoints.filter((e) => /\.(ts|js)$/.test(e));
for (const e of scripts) {
	const trail = pathToPackage(e, pkg);
	const label = e.replace('src/client/scripts/esm/', '');
	if (!trail) {
		console.log(`  no ${pkg}   ${label}`);
		continue;
	}
	console.log(` ${pkg.toUpperCase()}      ${label}`);
	if (why) for (const step of trail.slice(1)) console.log(`             -> ${step}`);
	if (cost) {
		const [full, stubbed] = await Promise.all([sizeOf(e, undefined), sizeOf(e, pkg)]);
		console.log(`             ${kb(full)} total, ${kb(full - stubbed)} of it ${pkg}`);
	}
}
