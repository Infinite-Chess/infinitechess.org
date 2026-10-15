// scripts/modules/pkg-cost.ts

/**
 * Which client pages bundle an npm package, why, and what it costs them.
 *
 * Usage:
 *   npx tsx scripts/modules/pkg-cost.ts <pkg> [--why] [--cost]
 *
 * --why prints the shortest import chain pulling it in; --cost bundles each entry twice, once
 * with the package stubbed empty, and diffs the minified bytes — reading up to ~0.6 KB low,
 * since the stub pulls esbuild's CommonJS interop helpers into the stubbed build.
 *
 * A heavy package is a placement constraint of its own. Before relocating a module that imports
 * one, check its new home is reached only by pages already carrying it. Type-only imports are
 * skipped throughout, since esbuild erases them.
 */

import fs from 'node:fs';
import esbuild from 'esbuild';

import srcgraph from './srcgraph.js';
import { ESMEntryPoints } from '../../build/client.js';

// Arguments -------------------------------------------------------------------

const args = process.argv.slice(2);
const why = args.includes('--why');
const cost = args.includes('--cost');
const pkg = args.find((a) => !a.startsWith('--'));
if (pkg === undefined) {
	console.error('Usage: npx tsx scripts/modules/pkg-cost.ts <pkg> [--why] [--cost]');
	process.exit(1);
}

// State -----------------------------------------------------------------------

/** file -> its runtime deps, split into first-party files and bare package specifiers. */
const depCache = new Map<string, { local: string[]; bare: string[] }>();

// Graph -----------------------------------------------------------------------

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

/** A file's runtime imports, static and dynamic, with type-only ones dropped. */
function depsOf(f: string): { local: string[]; bare: string[] } {
	if (depCache.has(f)) return depCache.get(f)!;
	const local: string[] = [];
	const bare: string[] = [];
	for (const spec of srcgraph.runtimeSpecifiers(f, fs.readFileSync(f, 'utf8'))) {
		if (!spec.startsWith('.')) {
			bare.push(spec);
			continue;
		}
		const resolved = srcgraph.resolveRelative(f, spec);
		if (resolved) local.push(resolved);
	}
	const r = { local, bare };
	depCache.set(f, r);
	return r;
}

// Cost ------------------------------------------------------------------------

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

/** Replaces `pkg` with an empty module, so its bytes drop out of the bundle. */
function stubPackage(pkg: string): esbuild.Plugin {
	return {
		name: 'stub-pkg',
		setup(build) {
			build.onResolve({ filter: new RegExp(`^${pkg}(/|$)`) }, () => ({
				path: pkg,
				namespace: 'stub',
			}));
			build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
				contents: '',
				loader: 'empty',
			}));
		},
	};
}

/** Formats a byte count as kilobytes. */
function kb(n: number): string {
	return `${(n / 1024).toFixed(1)} KB`;
}

// Report ----------------------------------------------------------------------

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
