// scripts/imports/ladder.ts

/**
 * Direction, cycles and shape of any one src/ root's import graph.
 *
 *   npx tsx scripts/imports/ladder.ts <shared|server|client> <mode> [arg]
 *
 *   edges               Every import pointing UP the ladder. Should print 0.
 *   dirs                Directory-level SCCs, then the full directory edge list. Should say DAG.
 *   sccs [substr]       File-level cycles. One inside a single directory is ladder-legal, still a
 *                       cycle. With a substring, the full anatomy of the ONE cycle containing that
 *                       file instead: external importers, degrees, which single lift collapses it
 *                       most, and every internal edge with the SYMBOLS it carries — the symbols
 *                       are the diagnosis, since a contract type declared by one of its two
 *                       parties is the most common cause.
 *   consumers <substr>  Every importer of the matching file(s), across ALL THREE roots, marked
 *                       rt/type. The widest-consumer lookup — a module's home must sit at or
 *                       below its lowest-ranked consumer.
 *   survey              Per directory: each file's LOC, export count, fan-in (client/server/
 *                       shared) and fan-out, plus the intra-directory graph and its SCCs.
 *
 * Parses with ts.preProcessFile, so `import type` edges COUNT — that is the coupling a ladder
 * exists to catch, and esbuild erases it. The RANK tables below are the locked orderings; retune
 * one only when its ladder in import-rules.ts changes.
 */

import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';

// Types -----------------------------------------------------------------------

/** One root's ladder: where it lives, how a file maps to a node, and each node's rank. */
interface RootSpec {
	dir: string;
	/** The ladder node a file belongs to. Loose root files keep their own identity. */
	nodeOf: (file: string) => string;
	/** Ascending rank per node. Nodes sharing a rank may import each other sideways. */
	rank: Record<string, number>;
}

// Constants -------------------------------------------------------------------

const ROOTS = ['src/shared', 'src/client', 'src/server'];

/** Where each root's files sit relative to each other. Mirrors scripts/import-rules.ts. */
const SPECS: Record<string, RootSpec> = {
	shared: {
		dir: 'src/shared',
		nodeOf: (rel) => {
			const parts = rel.split('/');
			if (parts.length === 1) return `(root) ${rel}`;
			if (parts[0] === 'chess')
				return parts.length === 2 ? `chess/ ${parts[1]}` : `chess/${parts[1]}`;
			return parts[0]!;
		},
		rank: {
			types: 0, util: 0,
			'chess/util': 1,
			'chess/logic': 2,
			'chess/engines': 3,
			'chess/variants': 4,
			'chess/game': 5,
			components: 6, transport: 6,
		}, // prettier-ignore
	},
	server: {
		dir: 'src/server',
		nodeOf: (rel) => {
			const parts = rel.split('/');
			return parts.length === 1 ? `(root) ${rel}` : `${parts[0]}/`;
		},
		rank: {
			'(root) types.ts': 0,
			'config/': 1,
			'utility/': 2,
			'database/': 3,
			'cookies/': 4,
			'auth/': 5,
			'game/': 6, 'socket/': 6,
			'controllers/': 7,
			'api/': 8,
			'middleware/': 9,
			'routes/': 10,
			'(root) app.ts': 11, '(root) server.ts': 11, '(root) setupDev.ts': 11,
		}, // prettier-ignore
	},
	client: {
		dir: 'src/client/scripts/esm',
		nodeOf: (rel) => {
			const parts = rel.split('/');
			if (parts.length === 1) return `(root) ${rel}`;
			// views/ is a per-page island: each page is its own node, so sideways is caught too.
			return parts[0] === 'views' ? `views/${parts[1]!.replace(/\.[^.]+$/, '')}` : parts[0]!;
		},
		rank: { board: 1, game: 2 }, // Anything unlisted is the floor (0); views/* is handled below.
	},
};

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

/** Every first-party file, across all three roots — so `consumers` sees importers anywhere. */
const allFiles = ROOTS.flatMap((r) => (fs.existsSync(r) ? walk(r) : []));

/** file -> resolved deps */
const deps = new Map<string, Set<string>>();
/** "a->b" for edges carried by at least one non-type-only statement. */
const runtimeEdge = new Set<string>();
/** "a->b" -> the symbols each statement on that edge brings across. */
const edgeSymbols = new Map<string, string[]>();

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
	// Classify type-only separately with the AST (preProcessFile exposes neither that nor the
	// symbol names), recording what each statement carries across.
	const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
	const record = (spec: string, symbols: string[], typeOnly: boolean): void => {
		const r = resolveSpec(f, spec);
		if (!r || r === f) return;
		const key = `${f}->${r}`;
		if (!typeOnly) runtimeEdge.add(key);
		if (!edgeSymbols.has(key)) edgeSymbols.set(key, []);
		edgeSymbols.get(key)!.push(...symbols);
	};
	for (const stmt of sf.statements) {
		if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
			const clause = stmt.importClause;
			// `phaseModifier` is also set for `import defer`, which IS a runtime import.
			let typeOnly = clause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
			if (!typeOnly && clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name) {
				typeOnly = clause.namedBindings.elements.every((el) => el.isTypeOnly);
			} // prettier-ignore
			const symbols: string[] = [];
			if (clause?.name) symbols.push(clause.name.text);
			if (clause?.namedBindings) {
				if (ts.isNamedImports(clause.namedBindings)) {
					for (const el of clause.namedBindings.elements) symbols.push(el.name.text);
				} else symbols.push(`* as ${clause.namedBindings.name.text}`);
			}
			record(stmt.moduleSpecifier.text, symbols, typeOnly);
		} else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
			let typeOnly = stmt.isTypeOnly;
			if (!typeOnly && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
				typeOnly = stmt.exportClause.elements.every((el) => el.isTypeOnly);
			}
			const symbols = stmt.exportClause && ts.isNamedExports(stmt.exportClause)
				? stmt.exportClause.elements.map((el) => `re-export ${el.name.text}`)
				: ['re-export *'];
			record(stmt.moduleSpecifier.text, symbols, typeOnly);
		} // prettier-ignore
	}
	const visitDynamic = (n: ts.Node): void => {
		if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
			const a = n.arguments[0];
			if (a && ts.isStringLiteral(a) && a.text.startsWith('.')) record(a.text, ['(dynamic)'], false); // prettier-ignore
		}
		n.forEachChild(visitDynamic);
	};
	sf.statements.forEach(visitDynamic);
}

// Tarjan ----------------------------------------------------------------------

function tarjan(nodes: string[], edgesOf: (n: string) => Iterable<string>): string[][] {
	let index = 0;
	const idx = new Map<string, number>(),
		low = new Map<string, number>();
	const stack: string[] = [],
		onStack = new Set<string>(),
		sccs: string[][] = [];
	const nodeSet = new Set(nodes);
	const strong = (v: string): void => {
		idx.set(v, index); low.set(v, index); index++;
		stack.push(v); onStack.add(v);
		for (const w of edgesOf(v)) {
			if (!nodeSet.has(w)) continue;
			if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
			else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
		}
		if (low.get(v) === idx.get(v)) {
			const scc: string[] = [];
			let w: string;
			do { w = stack.pop()!; onStack.delete(w); scc.push(w); } while (w !== v);
			sccs.push(scc.sort());
		}
	}; // prettier-ignore
	for (const n of nodes) if (!idx.has(n)) strong(n);
	return sccs.filter((s) => s.length > 1);
}

// Modes -----------------------------------------------------------------------

const rootArg = process.argv[2];
const maybeSpec = rootArg ? SPECS[rootArg] : undefined;
if (!maybeSpec) {
	console.error(`Usage: npx tsx scripts/imports/ladder.ts <${Object.keys(SPECS).join('|')}> <mode> [arg]`); // prettier-ignore
	process.exit(1);
}
const spec = maybeSpec;
const ROOT = spec.dir;
const rootFiles = allFiles.filter((f) => f.startsWith(`${ROOT}/`));
const rel = (f: string): string => f.slice(ROOT.length + 1);
const nodeOf = (f: string): string => spec.nodeOf(rel(f));

/** A node's rung. Unlisted = the floor, except a per-page island, which sits at the top. */
function rankOf(node: string): number {
	if (node in spec.rank) return spec.rank[node]!;
	if (rootArg === 'client' && node.startsWith('views/')) return 3;
	if (rootArg === 'shared' && (node.startsWith('(root) ') || node.startsWith('chess/ ')))
		return -1;
	return 0;
}

const mode = process.argv[3] ?? 'edges';

if (mode === 'consumers') {
	const target = process.argv[4]!;
	for (const m of rootFiles.filter((f) => f.includes(target))) {
		const cons = allFiles.filter((f) => deps.get(f)!.has(m));
		console.log(`\n== ${m}  (${cons.length} consumers)`);
		for (const c of cons.sort()) console.log(`   ${runtimeEdge.has(`${c}->${m}`) ? 'rt  ' : 'type'} ${c}`);
	} // prettier-ignore
} else if (mode === 'edges') {
	const groups = new Map<string, string[]>();
	for (const f of rootFiles) {
		for (const d of deps.get(f)!) {
			if (!d.startsWith(`${ROOT}/`)) continue;
			const nf = nodeOf(f), nd = nodeOf(d);
			if (nf === nd || rankOf(nf) >= rankOf(nd)) continue;
			const key = `${nf} -> ${nd}`;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(`${runtimeEdge.has(`${f}->${d}`) ? 'rt  ' : 'type'} ${rel(f)} -> ${rel(d)}`);
		} // prettier-ignore
	}
	let total = 0;
	for (const [k, v] of [...groups].sort()) {
		total += v.length;
		console.log(`\n-- UP ${k} (${v.length})`);
		for (const e of v.sort()) console.log(`   ${e}`);
	}
	console.log(`\nTOTAL upward edges: ${total}`);
} else if (mode === 'dirs') {
	const dirNodes = [...new Set(rootFiles.map(nodeOf))];
	const dirDeps = new Map<string, Set<string>>(dirNodes.map((n) => [n, new Set<string>()]));
	for (const f of rootFiles) {
		for (const d of deps.get(f)!) {
			if (!d.startsWith(`${ROOT}/`)) continue;
			const nf = nodeOf(f), nd = nodeOf(d);
			if (nf !== nd) dirDeps.get(nf)!.add(nd);
		} // prettier-ignore
	}
	const sccs = tarjan(dirNodes, (n) => dirDeps.get(n)!);
	console.log('== directory-level SCCs ==');
	for (const s of sccs) console.log(`   { ${s.join(', ')} }`);
	if (sccs.length === 0) console.log('   none — directory graph is a DAG.');
	console.log('\n== directory edges ==');
	for (const n of dirNodes.sort()) {
		console.log(`   ${n} -> ${[...dirDeps.get(n)!].sort().join(', ') || '(none)'}`);
	}
} else if (mode === 'sccs') {
	const sccs = tarjan(rootFiles, (f) =>
		[...deps.get(f)!].filter((d) => d.startsWith(`${ROOT}/`)),
	);
	sccs.sort((a, b) => b.length - a.length);
	const target = process.argv[4];
	if (target === undefined) {
		for (const s of sccs) {
			console.log(`\n== SCC of ${s.length} files, spanning: ${[...new Set(s.map(nodeOf))].sort().join(', ')}`);
			for (const f of s) console.log(`   ${rel(f)}`);
		} // prettier-ignore
		if (sccs.length === 0) console.log('No file-level cycles.');
	} else {
		const scc = sccs.find((s) => s.some((f) => f.includes(target)));
		if (!scc) {
			console.error(`No cycle in ${ROOT} contains a file matching "${target}".`);
			process.exit(1);
		}
		anatomy(scc);
	}
} else if (mode === 'survey') {
	const byDir = new Map<string, string[]>();
	for (const f of rootFiles) {
		const d = path.posix.dirname(rel(f));
		if (!byDir.has(d)) byDir.set(d, []);
		byDir.get(d)!.push(f);
	}
	const importers = new Map<string, string[]>(rootFiles.map((f) => [f, [] as string[]]));
	for (const f of allFiles) for (const d of deps.get(f)!) importers.get(d)?.push(f);

	for (const d of [...byDir.keys()].sort()) {
		const files = byDir.get(d)!.sort();
		console.log(`\n\n######## ${d}  (${files.length} files)`);
		console.log('  LOC  exports          in:C/S/Sh  out      file');
		for (const f of files) {
			const loc = fs.readFileSync(f, 'utf8').split('\n').length;
			const ex = exportInfo(f);
			const imps = importers.get(f)!;
			const c = imps.filter((i) => i.startsWith('src/client/')).length;
			const s = imps.filter((i) => i.startsWith('src/server/')).length;
			const sh = imps.filter((i) => i.startsWith('src/shared/')).length;
			const out = [...deps.get(f)!].filter((x) => x.startsWith(`${ROOT}/`)).length;
			console.log(`  ${String(loc).padStart(4)}  ${ex.padEnd(16)} ${String(c).padStart(3)}/${String(s).padStart(2)}/${String(sh).padStart(2)}      ${String(out).padStart(2)}     ${path.posix.basename(f)}`); // prettier-ignore
		}
		console.log('  -- intra-directory edges --');
		const set = new Set(files);
		let any = false;
		for (const f of files) {
			const inner = [...deps.get(f)!].filter((x) => set.has(x)).sort();
			if (inner.length) {
				any = true;
				console.log(`     ${path.posix.basename(f)} -> ${inner.map((x) => path.posix.basename(x)).join(', ')}`);
			} // prettier-ignore
		}
		if (!any) console.log('     (none — flat directory)');
		const sccs = tarjan(files, (f) => deps.get(f)!);
		if (sccs.length) {
			console.log('  -- intra-directory SCCs --');
			for (const s of sccs)
				console.log(`     { ${s.map((x) => path.posix.basename(x)).join(', ')} }`);
		}
		const orphans = files.filter((f) => importers.get(f)!.length === 0);
		if (orphans.length) console.log(`  -- NO IMPORTERS: ${orphans.map(rel).join(', ')}`);
	}
} else {
	console.error(`Unknown mode "${mode}".`);
	process.exit(1);
}

// Helper Functions ------------------------------------------------------------

/**
 * Everything needed to diagnose ONE cycle. The mutual pairs and their symbols come first among
 * the detail, because a contract type declared by one of its two parties is the usual cause and
 * shows up there immediately.
 */
function anatomy(scc: string[]): void {
	const members = new Set(scc);
	const inScc = (f: string): string[] => [...deps.get(f)!].filter((d) => members.has(d));
	const kind = (key: string): string => (runtimeEdge.has(key) ? 'rt  ' : 'type');
	const syms = (key: string): string =>
		[...new Set(edgeSymbols.get(key) ?? [])].join(', ') || '(side-effect)';

	console.log(`== SCC of ${scc.length} files, spanning: ${[...new Set(scc.map(nodeOf))].sort().join(', ')}`); // prettier-ignore
	for (const f of scc) console.log(`   ${rel(f)}`);

	console.log('\n-- external importers (blast radius) --');
	const fanIn = new Map<string, number>();
	for (const f of allFiles) {
		if (members.has(f)) continue;
		for (const d of deps.get(f)!) if (members.has(d)) fanIn.set(d, (fanIn.get(d) ?? 0) + 1);
	}
	if (fanIn.size === 0) console.log('   (none — this cycle is private to its own files)');
	for (const [f, n] of [...fanIn].sort((a, b) => b[1] - a[1])) {
		console.log(`   ${String(n).padStart(3)}  ${rel(f)}`);
	}

	console.log('\n-- degree inside the cycle --');
	const deg = new Map(scc.map((f) => [f, { in: 0, out: 0 }]));
	for (const f of scc) {
		for (const d of inScc(f)) {
			deg.get(f)!.out++;
			deg.get(d)!.in++;
		}
	}
	for (const [f, d] of [...deg].sort((a, b) => b[1].in + b[1].out - (a[1].in + a[1].out))) {
		console.log(`   in ${String(d.in).padStart(2)}  out ${String(d.out).padStart(2)}   ${rel(f)}`); // prettier-ignore
	}

	// A low number means one file is holding the cycle together; a high one means a mesh, which
	// no single lift will fix.
	console.log('\n-- lifting ONE file out leaves this many still cycling --');
	const collapse = scc.map((f) => {
		const after = tarjan(scc.filter((o) => o !== f), (o) => deps.get(o)!); // prettier-ignore
		return { f, largest: Math.max(0, ...after.map((c) => c.length)) };
	});
	for (const c of collapse.sort((a, b) => a.largest - b.largest)) {
		console.log(`   ${String(c.largest).padStart(3)}  after lifting ${rel(c.f)}`);
	}

	const pairs: string[][] = [];
	const seen = new Set<string>();
	for (const f of scc) {
		for (const d of inScc(f)) {
			if (!inScc(d).includes(f)) continue;
			const key = [f, d].sort().join('|');
			if (seen.has(key)) continue;
			seen.add(key);
			pairs.push([
				`   ${rel(f)}  <->  ${rel(d)}`,
				`      ${kind(`${f}->${d}`)}  ${rel(f)} takes: ${syms(`${f}->${d}`)}`,
				`      ${kind(`${d}->${f}`)}  ${rel(d)} takes: ${syms(`${d}->${f}`)}`,
			]);
		}
	}
	console.log(`\n-- mutual pairs (${pairs.length}) --`);
	for (const p of pairs) console.log(p.join('\n'));

	const edges = scc.flatMap((f) =>
		inScc(f)
			.sort()
			.map((d) => `   ${kind(`${f}->${d}`)} ${rel(f)} -> ${rel(d)}   ${syms(`${f}->${d}`)}`),
	);
	console.log(`\n-- all internal edges (${edges.length}) --`);
	for (const e of edges.sort()) console.log(e);
}

/** A file's exported-symbol count: default-object members if present, plus named exports. */
function exportInfo(f: string): string {
	const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
	let named = 0;
	let defaultMembers: number | undefined;
	for (const stmt of sf.statements) {
		const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
		const isExported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
		if (ts.isExportAssignment(stmt)) {
			defaultMembers = ts.isObjectLiteralExpression(stmt.expression)
				? stmt.expression.properties.length
				: 1;
		} else if (isExported) {
			named += ts.isVariableStatement(stmt) ? stmt.declarationList.declarations.length : 1;
		} else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
			named += stmt.exportClause.elements.length;
		} // prettier-ignore
	}
	return defaultMembers !== undefined
		? `default(${defaultMembers})+named(${named})`
		: `named(${named})`;
}
