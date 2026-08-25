// scripts/imports/pagereach.ts

/**
 * Which client pages ship a module — the constraint that decides most placement questions.
 *
 *   npx tsx scripts/imports/pagereach.ts                    every client module, with its page set
 *   npx tsx scripts/imports/pagereach.ts <substring> ...    just the matching modules, any root
 *   npx tsx scripts/imports/pagereach.ts <substring> --why  plus the chain that drags each in
 *
 * With no argument this also lists the client modules NO page reaches.
 *
 * A file's home is set by its widest consumer, so the printed page set names the correct layer
 * directly. A module reached by components/header/header.ts is on EVERY page of the site,
 * login and register included.
 *
 * Resolution comes from esbuild's metafile — the SAME resolution as the real build — so
 * `import type` edges do not appear. That is correct for a bundling question and wrong for a
 * coupling one: use `ladder.ts` when type-only edges matter. A module shown as unreachable may
 * still be imported for its types.
 *
 * Pages with no entry in ESMEntryPoints yet are still scanned, and marked `*` in the output.
 * See docs/systems/BUILD.md — that list is hand-maintained.
 */

import esbuild from 'esbuild';
import { globSync } from 'node:fs';

import { ESMEntryPoints } from '../../build/client';

// Constants ---------------------------------------------------------------

const E = 'src/client/scripts/esm/';

/** Live script entries, read from the build so this can never drift. */
const LIVE = ESMEntryPoints.filter((e) => e.endsWith('.ts') || e.endsWith('.js'));

/** Pages that exist but have no entry in ESMEntryPoints yet. Marked `*` when printed. */
const DORMANT = [
	`${E}views/editor/boardeditor.ts`,
	`${E}views/checkmatepractice/checkmatepractice.ts`,
	`${E}views/icnvalidator/icnvalidator.ts`,
	`${E}views/icnvalidator/icnvalidator.worker.ts`,
	`${E}views/leaderboard.ts`,
	`${E}views/news.ts`,
	`${E}views/guide.ts`,
	`${E}views/admin.ts`,
];

const entries = [...LIVE, ...DORMANT];

/** Top-level directories reported in bulk mode. */
const PREFIXES = ['game/', 'util/', 'components/', 'board/', 'chess/', 'webgl/', 'audio/', 'socket/', 'savedpositions/']; // prettier-ignore

// Helper Functions --------------------------------------------------------

/** Trims the noisy common prefix so paths read cleanly. */
function short(f: string): string {
	return f.replace(/^src\/client\/scripts\/esm\//, '').replace(/^src\//, '');
}

/** A page's display name, suffixed `*` when it is not a registered entry point yet. */
function label(entry: string): string {
	const s = short(entry);
	let name = s;
	if (s.startsWith('views/')) {
		const rest = s.replace('views/', '');
		name = rest.includes('/') ? rest.split('/')[0]! : rest.replace('.ts', '');
	} else if (s.startsWith('components/header/')) name = 'header';
	else if (s.startsWith('game/chess/engines/apeiron')) name = 'apeiron.worker';
	else if (s.startsWith('game/chess/engines/engineCheckmate')) name = 'cmp.worker';
	return DORMANT.includes(entry) ? `${name}*` : name;
}

/** One page's bundle graph: every first-party input, and what each of them imports. */
async function graphOf(entry: string): Promise<Record<string, string[]>> {
	const result = await esbuild.build({
		entryPoints: [entry],
		bundle: true,
		metafile: true,
		write: false,
		logLevel: 'silent',
		format: 'esm',
		loader: { '.wasm': 'file', '.glsl': 'text' },
		external: ['/fonts/*'],
		outdir: 'pagereach-virtual-out', // Never written (write: false).
	});
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

// Report ------------------------------------------------------------------

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
			console.error(`!! failed to build ${short(entry)}`);
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
			const k = short(m);
			if (!byModule.has(k)) byModule.set(k, new Set());
			byModule.get(k)!.add(label(entry));
		}
	}
	const rows = [...byModule.entries()]
		.filter(([m]) => PREFIXES.some((p) => m.startsWith(p)))
		.map(([m, s]) => ({ m, e: [...s].sort() }))
		.sort((a, b) => a.m.localeCompare(b.m));
	for (const { m, e } of rows) console.log(`${e.join(',')}\t${m}`);

	// Files that NO page reaches at all.
	const all = globSync(`${E}**/*.ts`).map((f) => short(f));
	const orphans = all.filter((f) => !byModule.has(f) && !f.endsWith('.test.ts'));
	console.log('\n=== UNREACHABLE ===');
	for (const o of orphans.sort()) console.log(o);
}
