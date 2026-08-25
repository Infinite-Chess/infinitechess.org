// scripts/imports/import-rules.ts

/**
 * Enforces the client's import-boundary model.
 *
 * Usage:
 *   npm run import-rules     Exits non-zero on any problem.
 *
 * SISTER TOOLS in this directory — reach for these rather than re-deriving by grep. Each
 * one's own header carries its usage:
 *
 *   ladder.ts        Direction, cycles, a module's consumers, and a per-directory survey,
 *                    for any root. Counts `import type` edges, which the checks below do not.
 *   pagereach.ts     Which client pages ship a module, and with --why the chain that drags
 *                    it in. Bundle truth, from the esbuild metafile.
 *   pkg-cost.ts      Which pages bundle an npm package, and what it costs them in KB.
 *   import-chain.ts  Everything one page pulls in, grouped by depth.
 *
 * THE LADDER — a directory encodes its AUDIENCE, and imports only ever go DOWN
 * it: never up, and never sideways between two page islands.
 *
 *   (everything else)  any page — util/, webgl/, chess/, components/, shared/ …
 *   board/             pages that render a board at all, home page included
 *   game/              pages with an interactive board
 *   views/<page>/      that one page alone
 *
 * Here a file's home is its WIDEST CONSUMER, not its subject matter. `deltatime.ts`
 * reads like game code but lives in `board/` because `boardpos.ts` needs it,
 * and the home page reaches boardpos through variant preview tooltips.
 * `pagereach.ts` computes each module's widest consumer directly.
 *
 * TWO CHECKS, neither subsuming the other. Reachability asks "which pages may
 * descend this far", so it wants the shipped bundle. The ladder asks "which
 * direction may an import go", so it wants the source — esbuild erases
 * `import type` edges, over a third of the client's real coupling and exactly
 * what the ladder exists to catch. Never re-point the ladder at the metafile.
 *
 * Only rungs get a reachability rule. `chess/` and its floor-mates are usable by
 * anything, so they need none — do not add one.
 *
 * The ladder resolves RELATIVE specifiers only, safe while tsconfig.json
 * declares no `paths`. Add path aliases and the scan must learn to resolve them.
 *
 * All paths are "short form": "src/client/scripts/esm/" or "src/" chopped off
 * the front, giving views/index/index.ts and shared/util/typeutil.ts.
 *
 * ---------------------------------------------------------------------------
 * THE OTHER TWO LADDERS
 *
 * src/server and src/shared are layer-clean and ranked too, though only the
 * client's is enforced here so far. Both orderings are recorded below so that
 * placing a new file, or moving one, is a lookup rather than a re-derivation.
 *
 * src/server (bottom -> top). Units on ONE line share a rank and may import
 * each other sideways; that is deliberate, not an exception:
 *
 *   types.ts                       the file, not a directory — everything reads it
 *   config/, utility/, database/   process setup, generic helpers, persistence
 *   game/, socket/                 live game state and the connections carrying it
 *   controllers/                   request handlers that render or answer
 *   api/                           JSON endpoints
 *   middleware/                    what wraps a request before it reaches the above
 *   routes/                        the URL table
 *   app.ts, server.ts, setupDev.ts the process entry points
 *
 * Subject picks the directory here, and the widest-consumer rule does not apply: by it,
 * loginController.ts (reached only from routes/) would live in routes/. The ladder only
 * vetoes which way imports may point.
 *
 * The client differs because it ships ONE BUNDLE PER PAGE: a module's directory decides
 * which pages download it, so audience is the only thing worth naming, and two rules then
 * cover hundreds of files. The server ships unbundled and src/shared has no entry points,
 * so placement there costs no bytes and subject wins.
 *
 * src/shared (bottom -> top), every rank strict — no ties:
 *
 *   types/, util/       Vocabulary owing nothing to chess: coords, math, time,
 *                       color, JSON, jsutil. A file here must make sense to a
 *                       reader who has never heard of this game.
 *   chess/util/         Chess vocabulary that knows nothing of a board: gamerules,
 *                       win conditions, clock format, metadata tags, variant codes,
 *                       piece themes, game modifiers, the engine roster. Nothing
 *                       here may mention Board or Move.
 *   chess/logic/        The data model and the rules engine: OrganizedPieces, Board,
 *                       Move, movesets, legal moves, check, notation (ICN), and the
 *                       VariantModule contract. Works on a variant handed to it.
 *   chess/engines/      What an engine can handle. Needs a whole GameFile.
 *   chess/variants/     The variant definitions and the registry/cache that load
 *                       them, plus the policy keyed off which variant a game is.
 *   chess/game/         Decides WHICH variant and loads it (async) before building
 *                       or judging a game. The only rung that may reach the cache.
 *   components/         SSR-shared UI pieces.
 *   transport/          The transport contract — domain.ts and the two websocket
 *                       directions. Nothing under chess/ may import from here; a
 *                       schema the chess layer also needs is owned down the ladder,
 *                       beside the vocabulary it describes.
 *
 * Subject picks the directory here too, as on the server — every shared rung names a
 * KIND of thing, not an audience. So the widest-consumer rule does not apply, and a
 * file does NOT slide down a rung just because its lowest consumer allows it. The
 * ladder only vetoes which way imports may point. A file that fits no rung's subject
 * is carrying more than one responsibility; split it rather than picking the least
 * bad rung.
 *
 * The rung that keeps catching people out is chess/logic vs chess/game: "is a
 * variant handed to me, or do I have to go find it?" Everything that had to go
 * find one is what forced this split.
 *
 * A schema carrying zod is a placement constraint of its own — zod is ~60 KB
 * minified. chess/util/typeschemas.ts exists ONLY to hold schemas away from the
 * modules whose types they describe, so those modules stay zod-free: typeutil.ts,
 * which the header bundle every page loads reaches, and winconutil.ts, which
 * icnconverter.ts and through it both engine workers read. Measure before moving one.
 */

import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import esbuild, { Metafile } from 'esbuild';

import { ESMEntryPoints } from '../../build/client';

// Types -------------------------------------------------------------------

interface Rule {
	/** Restricted module's short path. Trailing "/" = directory prefix; else exact file. */
	target: string;
	/**
	 * Entry points allowed to reach the target, matched as a SUBSTRING of an
	 * entry's short path. An entry INSIDE the target needs no listing — a bundle
	 * rooted there cannot avoid containing it (e.g. the engine workers in game/).
	 */
	allowedEntries: string[];
}

/** One rung of the ladder: a directory, and who it is usable by. */
interface Layer {
	dir: string;
	audience: string;
}

// Constants ---------------------------------------------------------------

const SRC_PREFIX = 'src/';

/** Root the ladder scan walks — every first-party client script. */
const CLIENT_ESM = 'src/client/scripts/esm/';

/** How many edges one group lists before truncating, so a mass breakage stays readable. */
const MAX_LISTED = 20;

/** The per-page island rung — the only one that also forbids SIDEWAYS imports. */
const VIEWS = 'views/';

/** What a directory not on a rung is usable by — the floor of the ladder. */
const FLOOR_AUDIENCE = 'any page';

/**
 * The rungs in ASCENDING order — later means a smaller audience. Anything
 * unlisted sits at the floor. Each audience is the single source of its wording:
 * findings quote it, and reachability headings are built from it.
 */
const LAYERS: Layer[] = [
	{ dir: 'board/', audience: 'pages that render a board' },
	{ dir: 'game/', audience: 'pages with an interactive board' },
	{ dir: VIEWS, audience: 'one page only' },
];

/** The page islands with an interactive board — the base of both rules. */
const INTERACTIVE_BOARD_PAGES = [
	'views/game/',
	'views/analysis/',
	'views/editor/',
	'views/checkmatepractice/',
];

const RULES: Rule[] = [
	{ target: 'game/', allowedEntries: INTERACTIVE_BOARD_PAGES },
	{ target: 'board/', allowedEntries: [...INTERACTIVE_BOARD_PAGES, 'views/index/'] },
];

/** Only script entry points — the bundled CSS entries are skipped. */
const ENTRIES = ESMEntryPoints.filter((e) => e.endsWith('.ts') || e.endsWith('.js'));

// Helper Functions --------------------------------------------------------

/** Trims the noisy common prefix so paths read cleanly. */
function short(file: string): string {
	return file.replace(/^src\/client\/scripts\/esm\//, '').replace(/^src\//, '');
}

/** A module's top-level directory, slash included: "util/thread.ts" -> "util/". */
function topDirOf(moduleShort: string): string {
	return `${moduleShort.split('/')[0]!}/`;
}

/** A module's rung on the ladder. Unlisted top-level directories are the floor, 0. */
function rankOf(moduleShort: string): number {
	return LAYERS.findIndex((l) => l.dir === topDirOf(moduleShort)) + 1;
}

/** Who a module's directory is usable by, in words. */
function audienceOf(moduleShort: string): string {
	return LAYERS.find((l) => l.dir === topDirOf(moduleShort))?.audience ?? FLOOR_AUDIENCE;
}

/** The page a views/ module belongs to: "views/game/gui/x.ts" -> "game", "views/news.ts" -> "news". */
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

// Reachability Check ------------------------------------------------------

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
		// A trailing "/" matches a whole directory; otherwise the target is one exact file.
		const matches = (moduleShort: string): boolean =>
			rule.target.endsWith('/')
				? moduleShort.startsWith(rule.target)
				: moduleShort === rule.target;

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
		lines.push(
			`### ${rule.target} is only for ${audienceOf(rule.target)}.`,
			'',
			...findings,
			'',
		);
	}

	return { lines, problems };
}

// Ladder Check ------------------------------------------------------------

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
 * Asks "which direction may an import go": a pure source scan of every
 * first-party client file, counting `import type` edges that never reach a
 * bundle. Needs no entry points, so it also covers pages that have none yet.
 */
function checkLadder(): { lines: string[]; problems: number } {
	/**
	 * Directory-pair sentence -> the offending edges under it. An audience belongs
	 * to the DIRECTORY, so it is stated once per pair, not repeated on every edge.
	 */
	const upward = new Map<string, string[]>();
	const crossPage: string[] = [];

	for (const file of walkScripts(CLIENT_ESM)) {
		const from = short(file);
		const fromRank = rankOf(from);
		const source = fs.readFileSync(file, 'utf8');
		// TypeScript's own preprocessor: every import form, type-only included, comments excluded.
		for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
			if (!fileName.startsWith('.')) continue; // Bare specifiers are npm packages.
			const resolved = resolveRelative(file, fileName);
			if (resolved === undefined) continue; // No source file behind it — nothing to rank.
			const to = short(resolved);

			if (rankOf(to) > fromRank) {
				const pair =
					`${topDirOf(from)} (usable by ${audienceOf(from)})` +
					` must not import ${topDirOf(to)} (usable by ${audienceOf(to)})`;
				if (!upward.has(pair)) upward.set(pair, []);
				upward.get(pair)!.push(`- ${from} → ${to}`);
			} else if (
				from.startsWith(VIEWS) &&
				to.startsWith(VIEWS) &&
				pageOf(from) !== pageOf(to)
			) {
				crossPage.push(`- ${from} → ${to}`);
			}
		}
	}

	const lines: string[] = [];
	let problems = crossPage.length;

	if (upward.size > 0) {
		lines.push('### Files importing code with a smaller audience', '');
		for (const [pair, edges] of upward) {
			problems += edges.length;
			lines.push(pair, ...cap(edges), '');
		}
	}
	if (crossPage.length > 0) {
		lines.push("### One page importing another page's code", '', ...cap(crossPage), '');
	}
	return { lines, problems };
}

// Report ------------------------------------------------------------------

const reachability = await checkReachability();
const ladder = checkLadder();
const problems = reachability.problems + ladder.problems;

if (problems === 0) {
	console.log('Import rules: no problems.');
	process.exit(0);
}

// Ladder findings lead: one bad edge often causes several reachability findings below it.
console.log(['## Import rules', '', ...ladder.lines, ...reachability.lines].join('\n'));
console.error(`✗ ${problems} problem${problems === 1 ? '' : 's'}`);
process.exit(1);
