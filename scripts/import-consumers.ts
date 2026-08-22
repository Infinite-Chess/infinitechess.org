// scripts/import-consumers.ts

/**
 * Prints every client module with the set of pages that reach it, then the modules no
 * page reaches. Use it to decide where a file BELONGS: its home is set by its widest
 * consumer, so the printed set names the correct layer directly.
 *
 * The inverse of scripts/import-chain.ts, which starts from one page. Unlike
 * scripts/import-rules.ts it also feeds in the DORMANT pages (editor, checkmate
 * practice, icnvalidator, ...) whose entries are not yet in ESMEntryPoints — keep that
 * list current or their modules will read as unreachable.
 *
 * Caveat: esbuild erases `import type`, so type-only edges do not appear here. A module
 * shown as unreachable may still be imported for its types.
 *
 * Usage:
 *   npx tsx scripts/import-consumers.ts
 */

import esbuild from 'esbuild';
import { globSync } from 'node:fs';

import { ESMEntryPoints } from '../build/client';

const E = 'src/client/scripts/esm/';

/** Live script entries, read from the build so this can never drift. */
const LIVE = ESMEntryPoints.filter((e) => e.endsWith('.ts') || e.endsWith('.js'));

/** Pages that exist but have no entry in ESMEntryPoints yet. */
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

/** Short label for an entry point. */
function label(entry: string): string {
	const s = entry.replace(E, '');
	if (s.startsWith('views/')) {
		const rest = s.replace('views/', '');
		return rest.includes('/') ? rest.split('/')[0]! : rest.replace('.ts', '');
	}
	if (s.startsWith('components/header/')) return 'header';
	if (s.startsWith('game/chess/engines/apeiron')) return 'apeiron.worker';
	if (s.startsWith('game/chess/engines/engineCheckmate')) return 'cmp.worker';
	return s;
}

function short(f: string): string {
	return f.replace(/^src\/client\/scripts\/esm\//, '').replace(/^src\//, '');
}

async function reachable(entry: string): Promise<string[]> {
	const result = await esbuild.build({
		entryPoints: [entry],
		bundle: true,
		metafile: true,
		write: false,
		logLevel: 'silent',
		format: 'esm',
		loader: { '.wasm': 'file', '.glsl': 'text' },
		external: ['/fonts/*'],
		outdir: 'import-consumers-virtual-out',
	});
	return Object.keys(result.metafile.inputs).filter((f) => f.startsWith('src/'));
}

const byModule = new Map<string, Set<string>>();
await Promise.all(
	entries.map(async (entry) => {
		let mods: string[];
		try {
			mods = await reachable(entry);
		} catch {
			console.error(`!! failed to build ${short(entry)}`);
			return;
		}
		for (const m of mods) {
			const k = short(m);
			if (!byModule.has(k)) byModule.set(k, new Set());
			byModule.get(k)!.add(label(entry));
		}
	}),
);

// Report every module under the layers we're auditing.
const PREFIXES = ['game/', 'util/', 'components/', 'board/', 'chess/', 'webgl/', 'audio/', 'socket/', 'savedpositions/']; // prettier-ignore
const rows = [...byModule.entries()]
	.filter(([m]) => PREFIXES.some((p) => m.startsWith(p)))
	.map(([m, s]) => ({ m, e: [...s].sort() }))
	.sort((a, b) => a.m.localeCompare(b.m));

for (const { m, e } of rows) console.log(`${e.join(',')}\t${m}`);

// Files that NO entry reaches at all.
const all = globSync(`${E}**/*.ts`).map(short);
const orphans = all.filter((f) => !byModule.has(f) && !f.endsWith('.test.ts'));
console.log('\n=== UNREACHABLE ===');
for (const o of orphans.sort()) console.log(o);
