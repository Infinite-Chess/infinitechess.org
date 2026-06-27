// scripts/import-chain.ts

/**
 * Studies the entire import chain of a single script, grouped by depth.
 *
 * Uses esbuild's metafile (the SAME resolution as the real build) to walk every
 * transitive import under src/, then runs a breadth-first search from the entry
 * point. Each module is reported at its SHORTEST distance from the entry; if a
 * module is reachable by several paths, every importer ("parent") is still shown.
 *
 * Purpose: spot modules that leak onto a page they shouldn't — typically a deep
 * import the entry point never asks for directly — so dependencies can be
 * refactored to stay healthy.
 *
 * Usage:
 *   npx tsx scripts/import-chain.ts <path-to-script>
 *
 * Writes the depth-grouped markdown report to "<script-name>.import-chain.md"
 * in the current directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

// ================================= ARGS ======================================

const entryArg = process.argv[2];

if (!entryArg) {
	console.error('Usage: tsx scripts/import-chain.ts <path-to-script>');
	process.exit(1);
}

/** The entry point as a cwd-relative, forward-slash path — matching esbuild metafile keys. */
const entry = path.relative(process.cwd(), path.resolve(entryArg)).split(path.sep).join('/');

// ============================= BUILD THE GRAPH ===============================

/** Only modules under this prefix are studied; node_modules and assets elsewhere are ignored. */
const SRC_PREFIX = 'src/';

const result = await esbuild.build({
	entryPoints: [entry],
	bundle: true,
	metafile: true,
	write: false,
	logLevel: 'silent',
	format: 'esm',
	// Mirror the real client build so resolution never errors on these.
	loader: { '.wasm': 'file', '.glsl': 'text' },
	external: ['/fonts/*'],
	outdir: 'import-chain-virtual-out', // Never written (write: false).
});

const inputs = result.metafile.inputs;

if (!(entry in inputs)) {
	console.error(`Entry point not found in build graph: ${entry}`);
	process.exit(1);
}

/** Adjacency list of first-party modules: module → its direct first-party imports. */
const adjacency = new Map<string, string[]>();
for (const [file, data] of Object.entries(inputs)) {
	if (!file.startsWith(SRC_PREFIX)) continue;
	const deps = data.imports
		.filter((imp) => !imp.external && imp.path.startsWith(SRC_PREFIX) && imp.path in inputs)
		.map((imp) => imp.path);
	adjacency.set(file, [...new Set(deps)]);
}

// ===================== BREADTH-FIRST SHORTEST-DEPTH WALK =====================

/** module → shortest distance from the entry point. */
const depth = new Map<string, number>([[entry, 0]]);
/** module → every module that directly imports it (within the reachable graph). */
const parents = new Map<string, Set<string>>();

const queue: string[] = [entry];
while (queue.length > 0) {
	const current = queue.shift()!;
	for (const dep of adjacency.get(current) ?? []) {
		if (!parents.has(dep)) parents.set(dep, new Set());
		parents.get(dep)!.add(current); // Record every importer, not just the first.
		if (!depth.has(dep)) {
			depth.set(dep, depth.get(current)! + 1);
			queue.push(dep);
		}
	}
}

/** depth level → modules first reached at that level, sorted by path (groups directories). */
const levels = new Map<number, string[]>();
for (const [file, d] of depth) {
	if (!levels.has(d)) levels.set(d, []);
	levels.get(d)!.push(file);
}
for (const list of levels.values()) list.sort();

const maxDepth = Math.max(...levels.keys());

// =============================== MARKDOWN REPORT =============================

/** Trims the noisy common prefix so paths read cleanly while still showing src boundaries. */
function short(file: string): string {
	return file.replace(/^src\/client\/scripts\/esm\//, '').replace(/^src\//, '');
}

const lines: string[] = [];
lines.push(`# Import chain: ${short(entry)}`);
lines.push('');
lines.push(`Entry: \`${entry}\``);
lines.push(`Total first-party modules: ${depth.size} · Max depth: ${maxDepth}`);
lines.push('');

for (let d = 0; d <= maxDepth; d++) {
	const group = levels.get(d) ?? [];
	if (group.length === 0) continue;
	lines.push(`## Depth ${d} (${group.length} module${group.length === 1 ? '' : 's'})`);
	for (const file of group) {
		const importers = [...(parents.get(file) ?? [])].sort();
		// The importer on the shortest path is any parent one level shallower (depth d-1).
		const shortestImporter = importers.find((p) => depth.get(p) === d - 1);
		// Importers at a SHALLOWER depth define this module's depth; deeper/equal ones are "back" edges.
		const back = importers.filter((p) => depth.get(p)! >= d);
		const suffix =
			importers.length > 0
				? `  ⟵ \`${shortestImporter ? short(shortestImporter) : '?'}\`` +
					` (${importers.length} importer${importers.length === 1 ? '' : 's'}` +
					(back.length > 0 ? `, ${back.length} from same/deeper level` : '') +
					')'
				: '';
		lines.push(`- \`${short(file)}\`${suffix}`);
	}
	lines.push('');
}

const outPath = `${path.basename(entry, path.extname(entry))}.import-chain.md`;
fs.writeFileSync(outPath, lines.join('\n'));
console.error(`Wrote ${outPath}`);
