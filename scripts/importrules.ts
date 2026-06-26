// scripts/importrules.ts

/**
 * Enforces import-boundary rules across every page entry point.
 *
 * Each rule names a restricted target (a module or directory) and the entry
 * points allowed to pull it in. The checker builds each entry's full transitive
 * graph (via esbuild's metafile — the SAME resolution as the real build) and
 * reports any DISALLOWED entry that reaches the target anywhere in its tree.
 *
 * Run manually:
 *   npx tsx scripts/importrules.ts
 *
 * Exits non-zero if any rule is violated.
 *
 * ============================ EDITING RULES ============================
 * Add/edit/remove entries in the RULES array below.
 *   target         A module's short path. A trailing "/" matches a whole
 *                  directory (prefix); otherwise it's an exact file.
 *   allowedEntries Entry points permitted to reach the target. Matched as a
 *                  SUBSTRING of an entry's short path.
 * ALL paths are "short form" — the front of the real path is chopped off:
 *   - client scripts: drop "src/client/scripts/esm/"
 *       src/client/scripts/esm/views/index/index.ts  ->  views/index/index.ts
 *       src/client/scripts/esm/components/header/header.ts  ->  components/header/header.ts
 *   - shared/server:  drop only "src/"
 *       src/shared/chess/util/typeutil.ts  ->  shared/chess/util/typeutil.ts
 */

import esbuild from 'esbuild';

import { ESMEntryPoints } from '../build/client';

// ================================= RULES =====================================

interface Rule {
	/** Human-readable purpose, shown in the report. */
	description: string;
	/** Restricted module's short path. Trailing "/" = directory prefix; else exact file. */
	target: string;
	/** Entry points allowed to reach the target (substring match on the entry's short path). */
	allowedEntries: string[];
}

const RULES: Rule[] = [
	{
		description: 'gameslot.ts is only for pages that load an interactive board.',
		target: 'game/chess/gameslot.ts',
		allowedEntries: ['views/game/game.ts', 'analysis', 'boardeditor'],
	},
	{
		description: 'Board editor code is private to the board editor page.',
		target: 'game/boardeditor/',
		allowedEntries: ['editor'],
	},
];

// ================================= HELPERS ===================================

const SRC_PREFIX = 'src/';

/** Trims the noisy common prefix so paths read cleanly (matches importchain.ts). */
function short(file: string): string {
	return file.replace(/^src\/client\/scripts\/esm\//, '').replace(/^src\//, '');
}

function matchesTarget(moduleShort: string, target: string): boolean {
	return target.endsWith('/') ? moduleShort.startsWith(target) : moduleShort === target;
}

function entryAllowed(entryShort: string, allowed: string[]): boolean {
	return allowed.some((a) => entryShort.includes(a));
}

/** Every first-party module reachable from an entry point. */
async function reachableModules(entry: string): Promise<string[]> {
	const result = await esbuild.build({
		entryPoints: [entry],
		bundle: true,
		metafile: true,
		write: false,
		logLevel: 'silent',
		format: 'esm',
		loader: { '.wasm': 'file', '.glsl': 'text' },
		external: ['/fonts/*'],
		outdir: 'importrules-virtual-out', // Never written (write: false).
	});
	return Object.keys(result.metafile.inputs).filter((f) => f.startsWith(SRC_PREFIX));
}

// ================================= CHECK =====================================

// Only script entry points — skip the bundled CSS entries.
const entries = ESMEntryPoints.filter((e) => e.endsWith('.ts') || e.endsWith('.js'));

// Compute each entry's reachable set once, then evaluate all rules against it.
const reachByEntry = new Map<string, string[]>();
await Promise.all(
	entries.map(async (entry) => reachByEntry.set(entry, await reachableModules(entry))),
);

const lines: string[] = ['# Import rule check', ''];
let violations = 0;
/** Full paths of entry points that broke at least one rule — for the importchain tip. */
const offendingEntries = new Set<string>();

for (const rule of RULES) {
	const offenders: { entry: string; hits: string[] }[] = [];
	for (const entry of entries) {
		const entryShort = short(entry);
		if (entryAllowed(entryShort, rule.allowedEntries)) continue;
		const hits = reachByEntry
			.get(entry)!
			.map(short)
			.filter((m) => matchesTarget(m, rule.target));
		if (hits.length > 0) {
			offenders.push({ entry: entryShort, hits });
			offendingEntries.add(entry);
		}
	}

	if (offenders.length === 0) continue; // Only failures are logged.

	violations += offenders.length;
	lines.push(`## ❌ ${rule.description}`);
	lines.push(`Allowed: [${rule.allowedEntries.join(', ')}] · Target: \`${rule.target}\``);
	for (const { entry, hits } of offenders) {
		const sample = hits
			.slice(0, 3)
			.map((h) => `\`${h}\``)
			.join(', ');
		const extra = hits.length > 3 ? ` (+${hits.length - 3} more)` : '';
		lines.push(`- \`${entry}\` reaches ${sample}${extra}`);
	}
	lines.push('');
}

if (violations === 0) {
	console.log(`✅ All ${RULES.length} import rules pass.`);
	process.exit(0);
}

console.log(lines.join('\n'));
console.error(`${violations} violation(s) across ${RULES.length} rule(s).`);
console.error(
	"\nTo trace how a target gets pulled in, view the offending page's full import chain:",
);
for (const entry of offendingEntries) {
	console.error(`  npx tsx scripts/importchain.ts ${entry}`);
}
process.exit(1);
