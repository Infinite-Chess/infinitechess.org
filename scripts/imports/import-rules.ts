// scripts/imports/import-rules.ts

/**
 * Enforces every src/ root's import-boundary model — the three ladders, the server file-cycle
 * check, the reachability rules, and the gates. Run via `npm run import-rules` (a pass inside
 * `npm run check`); exits non-zero on any problem.
 *
 * THE FULL MODEL lives in docs/systems/IMPORT_RULES.md: all three ladders and what each rung
 * is for, every rule and gate, the deliberate absences, and the workflows for placing a
 * module or changing the rules. Keep that document in step — not a second copy of it here.
 *
 * SISTER TOOLS in this directory — reach for these rather than re-deriving by grep. Each
 * one's own header carries its usage:
 *
 *   ladder.ts        Who imports a module, type-only edges included (the widest-consumer
 *                    lookup), plus the direction/cycle/shape surveys behind the rules here.
 *   page-reach.ts    Which client pages ship a module, and with --why the chain that drags
 *                    it in. Bundle truth, from the esbuild metafile.
 *   pkg-cost.ts      Which pages bundle an npm package, and what it costs them in KB.
 *
 * All paths are "short form": "src/client/scripts/esm/" or "src/" chopped off the front,
 * giving views/index/index.ts and shared/util/typeutil.ts. The scan resolves RELATIVE
 * specifiers only — safe while tsconfig.json declares no `paths`; add path aliases and the
 * scan must learn to resolve them.
 */

import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import esbuild, { Metafile } from 'esbuild';

import { ESMEntryPoints } from '../../build/client';

// Types -----------------------------------------------------------------------

/** One of the three src/ roots the checks walk. */
type RootName = 'client' | 'server' | 'shared';

interface Rule {
	/** Restricted module's short path. Trailing "/" = directory prefix; else exact file. */
	target: string;
	/** Who the target is for, in words — the finding's heading quotes it. */
	audience: string;
	/**
	 * Entry points allowed to reach the target, matched as a SUBSTRING of an
	 * entry's short path. An entry INSIDE the target needs no listing — a bundle
	 * rooted there cannot avoid containing it (e.g. the engine workers in game/).
	 */
	allowedEntries: string[];
}

/** A module only the listed importers may even name — every page may still REACH it through them. */
interface Gate {
	/** Restricted module's short path. Trailing "/" = directory prefix; else exact file. */
	target: string;
	allowedImporters: string[];
}

/** One rung of a ladder: units sharing it may import each other sideways, deliberately. */
interface Rank {
	/** Directories (trailing "/") or exact files, relative to the ladder's root. */
	units: string[];
	/** What the rung is for, in words — findings quote it, one sentence per pair. */
	audience: string;
}

/** One root's ladder: where its files live and its rungs in ASCENDING order. */
interface Ladder {
	root: string;
	/** The root's prefix in short form — '' for the client, 'server/', 'shared/'. */
	prefix: string;
	ranks: Rank[];
}

/** Where a module sits on its ladder: the rung's index, naming unit, and audience. */
interface Rung {
	rank: number;
	unit: string;
	audience: string;
}

/** One import between first-party files, in short form. */
interface Edge {
	from: string;
	to: string;
}

// Constants -------------------------------------------------------------------

const SRC_PREFIX = 'src/';

/** How many edges one group lists before truncating, so a mass breakage stays readable. */
const MAX_LISTED = 20;

/** The per-page island rung of the client ladder — the only one that also forbids SIDEWAYS imports between pages. */
const VIEWS = 'views/';

/** What a module on no rung is usable by — the floor of a ladder. */
const FLOOR_AUDIENCE = 'any page';

/**
 * The three roots' ladders, rungs in ASCENDING order — later means further up, and
 * imports may only point DOWN. Exact files rank individually (src/server's types.ts
 * at the very bottom, its entry points at the very top), and a sub-directory rung
 * (board/rendering/) sits above its parent (board/). Each audience is the single
 * source of its wording: findings quote it, one sentence per pair. Rungs sharing
 * an audience are still rungs: chess/ may not import components/, though both
 * ship everywhere.
 */
const LADDERS: Record<RootName, Ladder> = {
	client: {
		root: 'src/client/scripts/esm/',
		prefix: '',
		ranks: [
			{ units: ['util/', 'webgl/'], audience: 'any page' },
			{ units: ['audio/', 'chess/', 'handoffs/', 'savedpositions/'], audience: 'any page' },
			{ units: ['components/', 'socket/'], audience: 'any page' },
			{ units: ['board/'], audience: 'pages that render a board' },
			{ units: ['board/rendering/'], audience: 'pages that render a board' },
			{ units: ['board/variantselector/'], audience: 'pages that render a board' },
			{ units: ['game/'], audience: 'pages with an interactive board' },
			{ units: [VIEWS], audience: 'one page only' },
		],
	},
	server: {
		root: 'src/server/',
		prefix: 'server/',
		ranks: [
			{ units: ['types.ts'], audience: 'the type vocabulary everything reads' },
			{ units: ['config/'], audience: 'what is loaded once at boot' },
			{ units: ['utility/'], audience: 'infrastructure below the domain' },
			{ units: ['database/'], audience: 'persistence' },
			{ units: ['cookies/'], audience: 'cookie ownership' },
			{ units: ['auth/'], audience: 'identity and login sessions' },
			{
				units: ['game/', 'socket/'],
				audience: 'live game state and the connections carrying it',
			},
			{ units: ['controllers/'], audience: 'request handlers that render or answer' },
			{ units: ['api/'], audience: 'JSON endpoints' },
			{
				units: ['middleware/'],
				audience: 'what wraps a request before it reaches the above',
			},
			{ units: ['routes/'], audience: 'the URL table' },
			{ units: ['app.ts', 'server.ts', 'setupDev.ts'], audience: 'the process entry points' },
		],
	},
	shared: {
		root: 'src/shared/',
		prefix: 'shared/',
		ranks: [
			{ units: ['types/', 'util/'], audience: 'vocabulary owing nothing to chess' },
			{ units: ['chess/util/'], audience: 'chess vocabulary that knows nothing of a board' },
			{ units: ['chess/logic/'], audience: 'the data model and the rules engine' },
			{ units: ['chess/engines/'], audience: 'what an engine can handle' },
			{
				units: ['chess/variants/'],
				audience: 'the variant definitions and the registry that loads them',
			},
			{
				units: ['chess/game/'],
				audience: 'deciding WHICH variant, then building or judging the game',
			},
			{
				units: ['components/', 'transport/'],
				audience: 'UI shared with the server, and the transport contract',
			},
		],
	},
};

/** Roots whose FILE graph must be acyclic. The server is clean; the other two deliberately carry cycles. */
const ACYCLIC_ROOTS: RootName[] = ['server'];

/** The page islands with an interactive board — the base of every board-carrying rule. */
const INTERACTIVE_BOARD_PAGES = [
	'views/game/',
	'views/analysis/',
	'views/editor/',
	'views/checkmatepractice/',
];

/** Pages holding a live websocket — who may reach the transport contract. */
const SOCKET_PAGES = ['views/index/', 'views/game/'];

const RULES: Rule[] = [
	{
		target: 'game/',
		audience: 'pages with an interactive board',
		allowedEntries: INTERACTIVE_BOARD_PAGES,
	},
	{
		target: 'board/',
		audience: 'pages that render a board, home page included',
		allowedEntries: [...INTERACTIVE_BOARD_PAGES, 'views/index/'],
	},
	{
		target: 'shared/components/',
		audience: 'the app shell and the game pages',
		allowedEntries: [...INTERACTIVE_BOARD_PAGES, 'views/index/', 'components/header/'],
	},
	{
		target: 'shared/chess/util/',
		audience: 'anything chess-flavored, the header included',
		allowedEntries: [
			...INTERACTIVE_BOARD_PAGES,
			'views/index/',
			'components/header/',
			'game/chess/engines/',
		],
	},
	{
		target: 'shared/chess/logic/',
		audience: 'the interactive pages and the engine workers',
		allowedEntries: [...INTERACTIVE_BOARD_PAGES, 'views/index/', 'game/chess/engines/'],
	},
	{
		target: 'shared/chess/engines/',
		audience: 'the home page, via the engine card, and analysis',
		allowedEntries: ['views/index/', 'views/analysis/'],
	},
	{
		target: 'shared/chess/game/',
		audience: 'the interactive pages',
		allowedEntries: [...INTERACTIVE_BOARD_PAGES, 'views/index/'],
	},
	{
		target: 'shared/transport/',
		audience: 'pages holding a live websocket',
		allowedEntries: SOCKET_PAGES,
	},
];

const GATES: Gate[] = [
	{
		// Each variant's module loads through the registry's dynamic import(), arriving as
		// its own lazy chunk — a static import elsewhere would make that script eager in
		// the importing page's bundle, silently.
		target: 'shared/chess/variants/variant_scripts/',
		allowedImporters: ['shared/chess/variants/variantregistry.ts'],
	},
];

/** Only script entry points — the bundled CSS entries are skipped. */
const ENTRIES = ESMEntryPoints.filter((e) => e.endsWith('.ts') || e.endsWith('.js'));

// Helper Functions ------------------------------------------------------------

/** Trims the noisy common prefix so paths read cleanly. */
function short(file: string): string {
	return file.replace(/^src\/client\/scripts\/esm\//, '').replace(/^src\//, '');
}

/** Which root a short path lives under. */
function rootNameOf(moduleShort: string): RootName {
	return moduleShort.startsWith('server/')
		? 'server'
		: moduleShort.startsWith('shared/')
			? 'shared'
			: 'client';
}

/** A module's top-level directory, slash included: "util/thread.ts" -> "util/". */
function topDirOf(moduleShort: string): string {
	return `${moduleShort.split('/')[0]!}/`;
}

/**
 * A module's rung on its ladder: the DEEPEST matching unit wins, so a sub-rung
 * (board/rendering/) outranks its parent (board/), and exact files rank alone.
 * Anything unlisted sits at the floor, rank 0.
 */
function rungOf(ladder: Ladder, rel: string): Rung {
	for (let i = ladder.ranks.length - 1; i >= 0; i--) {
		const { units, audience } = ladder.ranks[i]!;
		const unit = units.find((u) => (u.endsWith('/') ? rel.startsWith(u) : rel === u));
		if (unit !== undefined) return { rank: i + 1, unit: ladder.prefix + unit, audience };
	}
	return { rank: 0, unit: ladder.prefix + topDirOf(rel), audience: FLOOR_AUDIENCE };
}

/** Directory targets prefix-match; otherwise the target is one exact file. */
function matchesPath(target: string, moduleShort: string): boolean {
	return target.endsWith('/') ? moduleShort.startsWith(target) : moduleShort === target;
}

/** The page a views/ module belongs to: "views/game/gui/x.ts" -> "game", "views/login.ts" -> "login". */
function pageOf(moduleShort: string): string {
	return moduleShort.split('/')[1]!.replace(/\.[^.]+$/, '');
}

/** Up to three hit names with the target prefix trimmed, then a count of the rest. */
function namesOf(hits: string[], target: string): string {
	const shown = hits.slice(0, 3).map((h) => h.slice(target.length));
	const rest = hits.length - shown.length;
	return shown.join(', ') + (rest > 0 ? `, +${rest}` : '');
}

/** Truncates a long edge list down to MAX_LISTED, noting how many were dropped. */
function cap(edges: string[]): string[] {
	if (edges.length <= MAX_LISTED) return edges;
	return [...edges.slice(0, MAX_LISTED), `- (+${edges.length - MAX_LISTED} more)`];
}

// Ladder Check ----------------------------------------------------------------

/** Every .ts/.js file under a directory, as cwd-relative forward-slash paths. */
function walkScripts(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const child = path.posix.join(dir, entry.name);
		if (entry.isDirectory()) walkScripts(child, out);
		else if (/\.(ts|js)$/.test(entry.name)) out.push(child);
	}
	return out;
}

/** Resolves a relative specifier to the file it means — ".js" specifiers point at ".ts" sources. */
function resolveRelative(fromFile: string, specifier: string): string | undefined {
	const base = path.posix.join(path.posix.dirname(fromFile), specifier);
	const candidates = [base.replace(/\.js$/, '.ts'), base, `${base}.ts`];
	return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
}

/**
 * Every first-party import edge across all three roots, in short form: one walk
 * feeding the ladder, cycle and gate checks. Relative specifiers only — bare ones
 * are npm packages, and cross-root direction is tsconfig's and the RULES' business,
 * not a ladder's.
 */
function collectEdges(): Edge[] {
	const edges: Edge[] = [];
	for (const ladder of Object.values(LADDERS)) {
		for (const file of walkScripts(ladder.root)) {
			const source = fs.readFileSync(file, 'utf8');
			// TypeScript's own preprocessor: every import form, type-only and dynamic included.
			for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
				if (!fileName.startsWith('.')) continue; // Bare specifiers are npm packages.
				const resolved = resolveRelative(file, fileName);
				if (resolved === undefined) continue; // No source file behind it — nothing to check.
				edges.push({ from: short(file), to: short(resolved) });
			}
		}
	}
	return edges;
}

/**
 * Asks "which direction may an import go" in every root: a pure source scan,
 * counting `import type` edges that never reach a bundle. Needs no entry points,
 * so it also covers pages that have none yet.
 */
function checkLadders(edges: Edge[]): { lines: string[]; problems: number } {
	/**
	 * Rung-pair sentence -> the offending edges under it. An audience belongs to
	 * the RUNG, so it is stated once per pair, not repeated on every edge.
	 */
	const upward = new Map<string, string[]>();
	const crossPage: string[] = [];

	for (const { from, to } of edges) {
		const name = rootNameOf(from);
		if (name !== rootNameOf(to)) continue; // Cross-root: not a ladder's business.
		const ladder = LADDERS[name];
		const fromRung = rungOf(ladder, from.slice(ladder.prefix.length));
		const toRung = rungOf(ladder, to.slice(ladder.prefix.length));

		if (toRung.rank > fromRung.rank) {
			const pair =
				`${fromRung.unit} (${fromRung.audience}) must not import` +
				` ${toRung.unit} (${toRung.audience})`;
			if (!upward.has(pair)) upward.set(pair, []);
			upward.get(pair)!.push(`- ${from} → ${to}`);
		} else if (from.startsWith(VIEWS) && to.startsWith(VIEWS) && pageOf(from) !== pageOf(to)) {
			crossPage.push(`- ${from} → ${to}`);
		}
	}

	const lines: string[] = [];
	let problems = crossPage.length;

	if (upward.size > 0) {
		lines.push('### Imports pointing up a ladder', '');
		for (const [pair, edgesUnderPair] of upward) {
			problems += edgesUnderPair.length;
			lines.push(pair, ...cap(edgesUnderPair), '');
		}
	}
	if (crossPage.length > 0) {
		lines.push("### One page importing another page's code", '', ...cap(crossPage), '');
	}
	return { lines, problems };
}

// Cycle Check -----------------------------------------------------------------

/**
 * Asks "is this root still ring-free": a Tarjan SCC pass over the FILE graph the
 * scan produced — the ladders rank directories, so a ring living entirely within
 * one directory would otherwise be ladder-legal. Only the roots in ACYCLIC_ROOTS
 * are held to this; the checker says nothing about the others.
 */
function checkCycles(edges: Edge[]): { lines: string[]; problems: number } {
	const lines: string[] = [];
	let problems = 0;

	for (const name of ACYCLIC_ROOTS) {
		const ladder = LADDERS[name];
		const importsOf = new Map<string, string[]>();
		for (const { from, to } of edges) {
			if (rootNameOf(from) !== name || rootNameOf(to) !== name) continue;
			if (!importsOf.has(from)) importsOf.set(from, []);
			importsOf.get(from)!.push(to);
		}
		const sccs = tarjan([...importsOf.keys()], (file) => importsOf.get(file) ?? []).filter(
			(scc) => scc.length > 1,
		);
		if (sccs.length === 0) continue;
		lines.push(`### Circular imports within ${ladder.root}`, '');
		for (const scc of sccs) {
			problems++;
			lines.push(`- ${scc.sort().join(' ↔ ')}`, '');
		}
	}
	return { lines, problems };
}

/** Tarjan's strongly connected components over a file graph. */
function tarjan(nodes: string[], importsOf: (file: string) => string[]): string[][] {
	let counter = 0;
	const index = new Map<string, number>();
	const lowlink = new Map<string, number>();
	const stack: string[] = [];
	const onStack = new Set<string>();
	const sccs: string[][] = [];

	const strongconnect = (file: string): void => {
		const i = counter++;
		index.set(file, i);
		lowlink.set(file, i);
		stack.push(file);
		onStack.add(file);
		for (const imported of importsOf(file)) {
			if (!index.has(imported)) {
				strongconnect(imported);
				lowlink.set(file, Math.min(lowlink.get(file)!, lowlink.get(imported)!));
			} else if (onStack.has(imported)) {
				lowlink.set(file, Math.min(lowlink.get(file)!, index.get(imported)!));
			}
		}
		if (lowlink.get(file) === index.get(file)) {
			const scc: string[] = [];
			let member: string;
			do {
				member = stack.pop()!;
				onStack.delete(member);
				scc.push(member);
			} while (member !== file);
			sccs.push(scc);
		}
	};

	for (const file of nodes) if (!index.has(file)) strongconnect(file);
	return sccs;
}

// Gate Check ------------------------------------------------------------------

/**
 * Asks "which MODULE may even name this": for targets every page legitimately
 * reaches through an allowed importer's dynamic imports, so no list of pages can
 * express the constraint. Checked against the SOURCE scan, not the bundle graph —
 * a static `import type` from the wrong module fails just as loudly.
 */
function checkGates(edges: Edge[]): { lines: string[]; problems: number } {
	const lines: string[] = [];
	let problems = 0;

	for (const gate of GATES) {
		const findings = edges
			.filter(
				({ from, to }) =>
					matchesPath(gate.target, to) &&
					// An importer INSIDE the target is exempt — it cannot avoid naming its own neighbors.
					!matchesPath(gate.target, from) &&
					!gate.allowedImporters.some((allowed) => matchesPath(allowed, from)),
			)
			.map(({ from, to }) => `- ${from} → ${to}`);
		if (findings.length === 0) continue;
		problems += findings.length;
		lines.push(
			`### ${gate.target} may only be imported by ${gate.allowedImporters.join(', ')}`,
			'',
			...cap(findings),
			'',
		);
	}
	return { lines, problems };
}

// Reachability Check ----------------------------------------------------------

/** An entry point's full transitive graph: every module it pulls in, and what each imports. */
async function bundleGraph(entry: string): Promise<Metafile['inputs']> {
	const result = await esbuild.build({
		entryPoints: [entry],
		bundle: true,
		metafile: true,
		write: false,
		logLevel: 'silent',
		format: 'esm',
		loader: { '.wasm': 'file', '.glsl': 'text' },
		external: ['/fonts/*'],
		outdir: 'import-rules-virtual-out', // Never written (write: false).
	});
	return result.metafile.inputs;
}

/**
 * The shortest import chain from an entry to the first module the target matches,
 * as short paths with the entry itself dropped — it is already named in the finding.
 * Callers must have confirmed a hit exists.
 */
function chainToTarget(
	graph: Metafile['inputs'],
	entry: string,
	matches: (moduleShort: string) => boolean,
): string[] {
	const importedBy = new Map<string, string>();
	const queue = [entry];
	const seen = new Set([entry]);

	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const imported of graph[current]!.imports) {
			const dep = imported.path;
			if (imported.external || !dep.startsWith(SRC_PREFIX) || !(dep in graph)) continue;
			if (seen.has(dep)) continue;
			seen.add(dep);
			importedBy.set(dep, current);
			if (!matches(short(dep))) {
				queue.push(dep);
				continue;
			}
			// Walk the breadcrumbs back up, stopping before the entry itself.
			const chain: string[] = [];
			for (let hop = dep; hop !== entry; hop = importedBy.get(hop)!)
				chain.unshift(short(hop));
			return chain;
		}
	}
	return [];
}

/**
 * Asks "which pages may descend this far": builds each entry's full transitive
 * graph (via esbuild's metafile — the SAME resolution as the real build) and
 * reports any DISALLOWED entry that reaches a restricted target in its tree.
 */
async function checkReachability(): Promise<{ lines: string[]; problems: number }> {
	// Build each entry's graph once, then evaluate all rules against it.
	const graphByEntry = new Map<string, Metafile['inputs']>();
	await Promise.all(
		ENTRIES.map(async (entry) => graphByEntry.set(entry, await bundleGraph(entry))),
	);

	const lines: string[] = [];
	let problems = 0;

	for (const rule of RULES) {
		const matches = (moduleShort: string): boolean => matchesPath(rule.target, moduleShort);

		const findings: string[] = [];
		for (const entry of ENTRIES) {
			const entryShort = short(entry);
			// A bundle rooted inside the target cannot avoid containing it.
			if (matches(entryShort)) continue;
			if (rule.allowedEntries.some((a) => entryShort.includes(a))) continue;

			const graph = graphByEntry.get(entry)!;
			const hits = Object.keys(graph)
				.filter((f) => f.startsWith(SRC_PREFIX)) // First-party only; skip node_modules.
				.map(short)
				.filter(matches);
			if (hits.length === 0) continue;

			// A directory target names its hits without repeating the prefix; a file target IS the hit.
			const detail = rule.target.endsWith('/')
				? `${hits.length} ${rule.target} modules: ${namesOf(hits, rule.target)}`
				: rule.target;
			findings.push(`- ${entryShort} bundles ${detail}`);
			// The offending import often sits many hops below the page, so name the path to it.
			findings.push(`    via ${chainToTarget(graph, entry, matches).join(' → ')}`);
			problems++;
		}

		if (findings.length === 0) continue; // Only failures are logged.
		lines.push(`### ${rule.target} is only for ${rule.audience}.`, '', ...findings, '');
	}

	return { lines, problems };
}

// Report ----------------------------------------------------------------------

const edges = collectEdges();
const ladders = checkLadders(edges);
const cycles = checkCycles(edges);
const gates = checkGates(edges);
const reachability = await checkReachability();
const problems = ladders.problems + cycles.problems + gates.problems + reachability.problems;

if (problems === 0) {
	console.log('Import rules: no problems.');
	process.exit(0);
}

// Ladder findings lead: one bad edge often causes several reachability findings below it.
console.log(
	[
		'## Import rules',
		'',
		...ladders.lines,
		...cycles.lines,
		...gates.lines,
		...reachability.lines,
	].join('\n'),
);
console.error(`✗ ${problems} problem${problems === 1 ? '' : 's'}`);
console.error('The model behind these rules: docs/systems/IMPORT_RULES.md');
process.exit(1);
