// scripts/modules/page-reach.ts

/**
 * Which client pages ship a module — the constraint that decides most placement questions.
 *
 * Usage:
 *   npx tsx scripts/modules/page-reach.ts                    every client module outside views/, with its page set
 *   npx tsx scripts/modules/page-reach.ts <substring> ...    just the matching modules, any root
 *   npx tsx scripts/modules/page-reach.ts <substring> --why  plus the chain that drags each in
 *
 * With no argument this also lists the client modules NO page reaches.
 *
 * A file's home is set by its widest consumer, so the printed page set names the correct layer
 * directly. A module reached by components/header/header.ts is on EVERY page of the site,
 * login and register included.
 *
 * Resolution comes from esbuild's metafile — the SAME resolution as the real build — so
 * `import type` edges do not appear. That is correct for a bundling question and wrong for a
 * coupling one: use `importers.ts` when type-only edges matter. A module shown as unreachable may
 * still be imported for its types.
 *
 * Pages with no entry in ENTRY_POINTS yet are still scanned, and marked `*` in the output.
 */

import path from 'node:path';
import { globSync } from 'node:fs';

import srcgraph from './srcgraph.js';

// Constants -------------------------------------------------------------------

const CLIENT_ROOT = 'src/client/scripts/';
const VIEWS_ROOT = `${CLIENT_ROOT}views/`;

/**
 * Pages not in ENTRY_POINTS yet, found by name: a page's entry is always
 * views/<page>.ts or views/<page>/<page>.ts.
 */
const DORMANT = [
	...globSync(`${VIEWS_ROOT}*.ts`),
	...globSync(`${VIEWS_ROOT}*/*.ts`).filter(
		(f) => path.basename(f, '.ts') === path.basename(path.dirname(f)),
	),
].filter((f) => !srcgraph.SCRIPT_ENTRIES.includes(f));

const entries = [...srcgraph.SCRIPT_ENTRIES, ...DORMANT];

// Helper Functions ------------------------------------------------------------

/** An entry's display name: its file name, suffixed `*` if dormant. */
function label(entry: string): string {
	const name = path.basename(entry, '.ts');
	return DORMANT.includes(entry) ? `${name}*` : name;
}

/** One page's bundle graph: every first-party input, and what each of them imports. */
async function graphOf(entry: string): Promise<Record<string, string[]>> {
	const result = await srcgraph.bundle([entry]);
	const out: Record<string, string[]> = {};
	for (const [file, meta] of Object.entries(result.metafile.inputs)) {
		if (!file.startsWith('src/')) continue;
		out[file] = meta.imports.map((i) => i.path).filter((p) => p.startsWith('src/'));
	}
	return out;
}

/** BFS from an entry to the first module matching `needle`, as the chain of files. */
function chainTo(graph: Record<string, string[]>, entry: string, needle: string): string[] | null {
	const prev = new Map<string, string>();
	const seen = new Set([entry]);
	const queue = [entry];
	while (queue.length) {
		const f = queue.shift()!;
		if (f !== entry && f.includes(needle)) {
			const chain: string[] = [];
			for (let n: string | undefined = f; n !== undefined; n = prev.get(n)) chain.unshift(n);
			return chain;
		}
		for (const d of graph[f] ?? []) {
			if (seen.has(d)) continue;
			seen.add(d);
			prev.set(d, f);
			queue.push(d);
		}
	}
	return null;
}

// Report ----------------------------------------------------------------------

const args = process.argv.slice(2);
const why = args.includes('--why');
const targets = args.filter((a) => !a.startsWith('--'));

/** entry -> its bundle graph, built once and shared by both modes. */
const graphs = new Map<string, Record<string, string[]>>();
await Promise.all(
	entries.map(async (entry) => {
		try {
			graphs.set(entry, await graphOf(entry));
		} catch {
			console.error(`!! failed to build ${srcgraph.short(entry)}`);
		}
	}),
);

if (targets.length > 0) {
	for (const t of targets) {
		console.log(`\n== reaches "${t}":`);
		for (const entry of entries) {
			const graph = graphs.get(entry);
			if (!graph) continue;
			const chain = chainTo(graph, entry, t);
			if (chain === null) continue;
			console.log(`   ${label(entry)}`);
			if (!why) continue;
			for (const [i, n] of chain.slice(1).entries())
				console.log(`   ${' '.repeat(i + 3)}-> ${n}`);
		}
	}
} else {
	const byModule = new Map<string, Set<string>>();
	for (const [entry, graph] of graphs) {
		for (const m of Object.keys(graph)) {
			if (!byModule.has(m)) byModule.set(m, new Set());
			byModule.get(m)!.add(label(entry));
		}
	}
	const rows = [...byModule.entries()]
		.filter(([m]) => m.startsWith(CLIENT_ROOT) && !m.startsWith(VIEWS_ROOT))
		.map(([m, s]) => ({ m: srcgraph.short(m), e: [...s].sort() }))
		.sort((a, b) => a.m.localeCompare(b.m));
	for (const { m, e } of rows) console.log(`${e.join(',')}\t${m}`);

	// Files that NO page reaches at all.
	const all = globSync(`${CLIENT_ROOT}**/*.ts`);
	const orphans = all.filter((f) => !byModule.has(f) && !f.endsWith('.test.ts'));
	console.log('\n=== UNREACHABLE ===');
	for (const o of orphans.map((f) => srcgraph.short(f)).sort()) console.log(o);
}
