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

import srcgraph from './srcgraph.js';

// Arguments -------------------------------------------------------------------

const target = process.argv[2];
if (target === undefined) {
	console.error('Usage: npx tsx scripts/modules/importers.ts <substr>');
	process.exit(1);
}

// Graph -----------------------------------------------------------------------

/** Every first-party file, across all three roots — so importers anywhere are seen. */
const allFiles = srcgraph.walkSrc().filter((f) => !f.endsWith('.d.ts'));

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
		const r = srcgraph.resolveRelative(f, ref.fileName);
		if (r && r !== f) set.add(r);
	}
	// Marks which of those edges survive into a bundle, which preProcessFile can't tell.
	for (const spec of srcgraph.runtimeSpecifiers(f, text)) {
		if (!spec.startsWith('.')) continue;
		const r = srcgraph.resolveRelative(f, spec);
		if (r && r !== f) runtimeEdge.add(`${f}->${r}`);
	}
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
