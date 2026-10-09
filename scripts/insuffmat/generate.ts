// scripts/insuffmat/generate.ts

/**
 * Generates a table of smallest mating piece sets, level by level (total piece count), from the
 * empty board up to a cap. A set is searched only once all its one-smaller subsets are draws, since
 * a set containing a mating set can also mate. Each result is appended to a progress file as it
 * arrives, so a stopped run resumes where it left off.
 *
 * Usage: npx tsx scripts/insuffmat/generate.ts <unbounded|bounded> <cap> <out dir> [threads]
 *
 * Writes <out dir>/<kind>/draws-N.txt and mates-N.tsv (witness lines, see verify.ts), and
 * durations-N.tsv (each searched set's label and milliseconds, for spotting slow ones). The bounded
 * run reuses <out dir>/unbounded's smallest mates, which are bounded mates too. README.md
 * documents the terms.
 */

import type { Kind, Material } from './matesearch.js';

import fs from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

import matesearch from './matesearch.js';

// Types -----------------------------------------------------------------------

/** A piece set: per side, a count for each kind in KINDS order. */
type PieceSet = [number[], number[]];

/** Which board the table is for. */
type BoardKind = 'unbounded' | 'bounded';

// Constants -------------------------------------------------------------------

const KINDS: Kind[] = [
	'K',
	'RC',
	'RQ',
	'Q',
	'R',
	'B0',
	'B1',
	'N',
	'P',
	'AM',
	'HA',
	'CH',
	'AR',
	'GU',
	'CA',
	'GI',
	'ZE',
	'CE',
	'NR',
	'HU',
	'RO',
];
const ROYAL_INDICES = (['K', 'RC', 'RQ'] as Kind[]).map((kind) => KINDS.indexOf(kind));
const P_INDEX = KINDS.indexOf('P');
const HU_INDEX = KINDS.indexOf('HU');
const ORTHOGONAL_SLIDER_INDICES = (['RQ', 'Q', 'R', 'AM', 'CH'] as Kind[]).map((kind) => KINDS.indexOf(kind)); // prettier-ignore
const ADJACENT_ATTACKER_INDICES = (['P', 'GU'] as Kind[]).map((kind) => KINDS.indexOf(kind));

/** Wall distances from the mated royal tried on bounded boards; _ is no wall. */
const WALL_DISTANCES = ['_', 0, 1, 2, 3, 4, 5, 6] as const;
/** The bounded search radius: all of 8x8 fits, so a royal queen's lines end at walls the search sees. */
const BOUNDED_RADIUS = '7';
/** Worker threads don't inherit tsx's TypeScript loader, so each registers it before loading this script. */
const WORKER_BOOT = `import('tsx/esm/api').then(({ register }) => { register(); return import(${JSON.stringify(import.meta.url)}); });`;

// Piece Sets ------------------------------------------------------------------

/** The set as text: white kinds uppercase, then " vs ", then black kinds lowercase, each comma-separated. */
function label([white, black]: PieceSet): string {
	const side = (counts: number[], upper: boolean): string => counts.flatMap((n, i) => Array<string>(n).fill(upper ? KINDS[i]! : KINDS[i]!.toLowerCase())).join(','); // prettier-ignore
	return `${side(white, true)} vs ${side(black, false)}`;
}

/** One key shared by a set and its mirror images (colors swapped, bishop colors swapped), which all mate equally. */
function canonicalKey(set: PieceSet): string {
	const swapBishops = (counts: number[]): number[] => counts.map((n, i) => (KINDS[i] === 'B0' ? counts[i + 1]! : KINDS[i] === 'B1' ? counts[i - 1]! : n)); // prettier-ignore
	const [white, black] = set;
	const variants: PieceSet[] = [set, [swapBishops(white), swapBishops(black)], [black, white], [swapBishops(black), swapBishops(white)]]; // prettier-ignore
	return variants.map(([w, b]) => `${w.join(',')}|${b.join(',')}`).sort()[0]!;
}

/** The set a key names. */
function fromKey(key: string): PieceSet {
	return key.split('|').map((side) => side.split(',').map(Number)) as PieceSet;
}

/** Every set with one more piece of any kind on either side. */
function oneLarger([white, black]: PieceSet): PieceSet[] {
	return KINDS.flatMap((_, i) => [
		[white.map((n, j) => (j === i ? n + 1 : n)), black] as PieceSet,
		[white, black.map((n, j) => (j === i ? n + 1 : n))] as PieceSet,
	]);
}

/** Every set with one piece fewer. */
function oneSmaller([white, black]: PieceSet): PieceSet[] {
	const out: PieceSet[] = [];
	for (let i = 0; i < KINDS.length; i++) {
		if (white[i]! > 0) out.push([white.map((n, j) => (j === i ? n - 1 : n)), black]);
		if (black[i]! > 0) out.push([white, black.map((n, j) => (j === i ? n - 1 : n))]);
	}
	return out;
}

/** Whether either side has a royal. Without one nobody can be checkmated, so the set is outside the table. */
function hasRoyal([white, black]: PieceSet): boolean {
	return ROYAL_INDICES.some((i) => white[i]! > 0 || black[i]! > 0);
}

/** One side's counts as the search's material. */
function toMaterial(counts: number[]): Material {
	return Object.fromEntries(
		KINDS.flatMap((kind, i) => (counts[i]! > 0 ? [[kind, counts[i]!]] : [])),
	) as Material;
}

// Generation ------------------------------------------------------------------

/** Builds the table level by level up to the cap. */
async function generate(
	boardKind: BoardKind,
	cap: number,
	outDir: string,
	threads: number,
): Promise<void> {
	const dir = `${outDir}/${boardKind}`;
	// Bounded runs reuse the unbounded table's mates, so it must reach the cap, or its mates would be searched as bounded draws.
	if (boardKind === 'bounded' && !fs.existsSync(`${outDir}/unbounded/mates-${cap}.tsv`))
		throw Error(`Generate the unbounded table up to ${cap} first.`);
	fs.mkdirSync(dir, { recursive: true });
	let draws = new Set([canonicalKey([KINDS.map(() => 0), KINDS.map(() => 0)])]);
	for (let level = 1; level <= cap; level++) {
		const started = performance.now();
		const candidates = nextCandidates(draws);
		const results = await searchLevel([...candidates], dir, level, boardKind, outDir, threads);
		draws = new Set([...results].filter(([, witness]) => witness === '').map(([key]) => key));
		const mates = [...results.values()].filter((witness) => witness !== '');
		fs.writeFileSync(
			`${dir}/draws-${level}.txt`,
			[...draws].map((key) => label(fromKey(key))).join('\n') + '\n',
		);
		fs.writeFileSync(`${dir}/mates-${level}.tsv`, mates.join('\n') + '\n');
		console.log(`level ${level}: ${candidates.size} searched, ${draws.size} draws, ${mates.length} smallest mates, ${((performance.now() - started) / 1000).toFixed(1)} s`); // prettier-ignore
	}
}

/** Every set one piece larger than a draw whose one-smaller subsets are all draws: the next level's sets to search. */
function nextCandidates(draws: Set<string>): Set<string> {
	// Sets without a royal are never stored, but count as draws.
	const isDraw = (subset: PieceSet): boolean =>
		!hasRoyal(subset) || draws.has(canonicalKey(subset));
	const candidates = new Set<string>();
	for (const key of draws)
		for (const child of oneLarger(fromKey(key))) {
			const childKey = canonicalKey(child);
			if (!hasRoyal(child) || candidates.has(childKey)) continue;
			if (oneSmaller(child).every((subset) => isDraw(subset))) candidates.add(childKey);
		}
	return candidates;
}

/**
 * Searches a level's sets on worker threads, resolving with each key's witness line ('' for a
 * draw). Results already in the level's progress file are reused; new ones are appended as they
 * arrive, and each set's search time to its durations file.
 */
function searchLevel(
	keys: string[],
	dir: string,
	level: number,
	boardKind: BoardKind,
	outDir: string,
	threads: number,
): Promise<Map<string, string>> {
	const progressFile = `${dir}/progress-${level}.tsv`;
	const durationsFile = `${dir}/durations-${level}.tsv`;
	const results = new Map<string, string>();
	const wanted = new Set(keys);
	if (fs.existsSync(progressFile))
		for (const line of fs.readFileSync(progressFile, 'utf8').split('\n').filter(Boolean)) {
			const tab = line.indexOf('\t');
			// A row for a set that is no longer a candidate (the level below changed) is stale.
			if (wanted.has(line.slice(0, tab)))
				results.set(line.slice(0, tab), line.slice(tab + 1));
		}
	const todo = keys.filter((key) => !results.has(key));
	return new Promise((resolve) => {
		let next = 0;
		let active = Math.min(threads, todo.length);
		if (active === 0) resolve(results);
		for (let w = 0; w < Math.min(threads, todo.length); w++) {
			const worker = new Worker(WORKER_BOOT, {
				eval: true,
				workerData: { boardKind, outDir },
				env: boardKind === 'bounded' ? { ...process.env, R: BOUNDED_RADIUS } : process.env,
			});
			const feed = (): void => {
				if (next < todo.length) worker.postMessage(todo[next++]);
				else void worker.terminate();
			};
			worker.on(
				'message',
				({ key, witness, ms }: { key: string; witness: string; ms: number }) => {
					results.set(key, witness);
					fs.appendFileSync(progressFile, `${key}\t${witness}\n`);
					fs.appendFileSync(durationsFile, `${label(fromKey(key))}\t${ms}\n`);
					feed();
				},
			);
			worker.on('exit', () => {
				if (--active === 0) resolve(results);
			});
			feed();
		}
	});
}

// Searching -------------------------------------------------------------------

/** The unbounded table's smallest mates by key, read from its mates files. */
function loadUnboundedMates(outDir: string): Map<string, string> {
	const dir = `${outDir}/unbounded`;
	const mates = new Map<string, string>();
	for (const file of fs.readdirSync(dir).filter((f) => /^mates-\d+\.tsv$/.test(f)))
		for (const line of fs.readFileSync(`${dir}/${file}`, 'utf8').split('\n').filter(Boolean)) {
			const [white, black] = matesearch.parse(line.split('\t')[0]!);
			mates.set(
				canonicalKey([KINDS.map((k) => white[k] ?? 0), KINDS.map((k) => black[k] ?? 0)]),
				line,
			);
		}
	return mates;
}

/**
 * Whether one side is a lone huygen and every piece of the other slides orthogonally: a draw proven
 * by hand, so never searched (with several royal queens the search runs for hours). The defending
 * piece nearest the huygen on its line of check can always capture it, leaving nothing to check with.
 */
function isLoneHuygenDraw([white, black]: PieceSet): boolean {
	const isLoneHuygen = (counts: number[]): boolean => counts.every((n, i) => n === (i === HU_INDEX ? 1 : 0)); // prettier-ignore
	const slidesOrthogonally = (counts: number[]): boolean => counts.every((n, i) => n === 0 || ORTHOGONAL_SLIDER_INDICES.includes(i)); // prettier-ignore
	return (
		(isLoneHuygen(white) && slidesOrthogonally(black)) ||
		(isLoneHuygen(black) && slidesOrthogonally(white))
	);
}

/**
 * Whether one side is a lone pawn or guard: a draw proven by hand, so never searched. It only attacks
 * adjacent squares, so any royal it checks can capture it, leaving nothing to check with, and its side
 * has no royal to be mated. Holds only while every royal kind can capture on all 8 adjacent squares.
 */
function isLoneAdjacentAttackerDraw([white, black]: PieceSet): boolean {
	const isLoneAdjacentAttacker = (counts: number[]): boolean => ADJACENT_ATTACKER_INDICES.some((i) => counts.every((n, j) => n === (j === i ? 1 : 0))); // prettier-ignore
	return isLoneAdjacentAttacker(white) || isLoneAdjacentAttacker(black);
}

/**
 * Whether the set can mate on a bounded board (any square of 8x8, or with a huygen, a large board's
 * edge or corner), as a witness line, or '' for a draw.
 */
function boundedMate(set: PieceSet, unboundedMates: Map<string, string>): string {
	const known = unboundedMates.get(canonicalKey(set));
	if (known) return known;
	const hasPawn = set[0][P_INDEX]! > 0 || set[1][P_INDEX]! > 0;
	// Every bounded mate fits on 8x8, the cheaper search, except ones needing a huygen far out along a
	// large board's open side (README).
	const hasHuygen = set[0][HU_INDEX]! > 0 || set[1][HU_INDEX]! > 0;
	const layouts = distinctLayouts(
		[...eightByEightLayouts(), ...(hasHuygen ? largeBoardLayouts(hasPawn) : [])],
		set,
	);
	try {
		for (const layout of layouts) {
			matesearch.setWalls(layout);
			const mate = matesearch.isMatePossible(toMaterial(set[0]), toMaterial(set[1]));
			if (mate) return matesearch.witnessLine(`${label(set)} @${layout}`, mate);
		}
	} finally {
		matesearch.setWalls('_,_,_,_');
	}
	return '';
}

/** Wall layouts a large board offers: a wall on the left and/or bottom (and top, for pawn sets, which aren't up-down symmetric). */
function largeBoardLayouts(hasPawn: boolean): string[] {
	const out: string[] = [];
	for (const i of WALL_DISTANCES)
		for (const j of WALL_DISTANCES) {
			if (i === '_' && j === '_') continue;
			const minX = i === '_' ? '_' : -i;
			out.push(`${minX},_,${j === '_' ? '_' : -j},_`);
			if (hasPawn) out.push(`${minX},_,_,${j === '_' ? '_' : j}`);
		}
	return out;
}

/** Wall layouts of an 8x8 board, with the mated royal on each of its squares. */
function eightByEightLayouts(): string[] {
	const out: string[] = [];
	for (let i = 0; i < 8; i++)
		for (let j = 0; j < 8; j++) out.push(`${-i},${7 - i},${-j},${7 - j}`);
	return out;
}

/**
 * The layouts, keeping one from each mirror-image family under the rotations and reflections that
 * preserve every piece of the set: mirroring a mate on one layout gives a mate on the others.
 */
function distinctLayouts(layouts: string[], set: PieceSet): string[] {
	const kinds = KINDS.filter((_, i) => set[0][i]! + set[1][i]! > 0);
	const transforms = matesearch.allowedTransforms(kinds);
	const families = new Set<string>();
	return layouts.filter((layout) => {
		const family = transforms.map((t) => transformLayout(layout, t)).sort()[0]!;
		if (families.has(family)) return false;
		families.add(family);
		return true;
	});
}

/** The layout rotated or reflected about the mated royal, in the same "minX,maxX,minY,maxY" format. */
function transformLayout(layout: string, t: (x: number, y: number) => [number, number]): string {
	const [minX, maxX, minY, maxY] = layout.split(',').map((v, i) => (v !== '_' ? Number(v) : i % 2 === 0 ? -Infinity : Infinity)) as [number, number, number, number]; // prettier-ignore
	const corners = [t(minX, minY), t(minX, maxY), t(maxX, minY), t(maxX, maxY)];
	const xs = corners.map(([x]) => x);
	const ys = corners.map(([, y]) => y);
	const bounds = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	return bounds.map((v) => (Number.isFinite(v) ? String(v) : '_')).join(',');
}

/** Whether the set can mate on an unbounded board, as a witness line, or '' for a draw. */
function unboundedMate(set: PieceSet): string {
	const mate = matesearch.isMatePossible(toMaterial(set[0]), toMaterial(set[1]));
	return mate ? matesearch.witnessLine(label(set), mate) : '';
}

// Entry -----------------------------------------------------------------------

if (isMainThread) {
	const [boardKind, cap, outDir, threads] = process.argv.slice(2);
	if (
		(boardKind !== 'unbounded' && boardKind !== 'bounded') ||
		cap === undefined ||
		outDir === undefined
	)
		throw Error(
			'Usage: npx tsx scripts/insuffmat/generate.ts <unbounded|bounded> <cap> <out dir> [threads]',
		);
	await generate(boardKind, Number(cap), outDir, Number(threads ?? os.availableParallelism()));
} else {
	const { boardKind, outDir } = workerData as { boardKind: BoardKind; outDir: string };
	const unboundedMates =
		boardKind === 'bounded' ? loadUnboundedMates(outDir) : new Map<string, string>();
	parentPort!.on('message', (key: string) => {
		const started = performance.now();
		const set = fromKey(key);
		const witness =
			isLoneHuygenDraw(set) || isLoneAdjacentAttackerDraw(set)
				? ''
				: boardKind === 'bounded'
					? boundedMate(set, unboundedMates)
					: unboundedMate(set);
		parentPort!.postMessage({ key, witness, ms: Math.round(performance.now() - started) });
	});
}
