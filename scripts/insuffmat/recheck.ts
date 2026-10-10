// scripts/insuffmat/recheck.ts

/**
 * Regression check for changes to matesearch.ts: re-searches a generated table's mates, and
 * optionally one level's unbounded draws, with the current search, and lists every set whose
 * verdict changed. Bounded mates are searched on the layout they were found on.
 *
 * Usage: npx tsx scripts/insuffmat/recheck.ts <unbounded|bounded> <out dir> [draw level]
 */

import fs from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';

import matesearch from './matesearch.js';

// Types -----------------------------------------------------------------------

/** A set to re-search: its label, the layout a bounded mate was found on, and the table's verdict. */
type Case = { label: string; layout: string | undefined; isMate: boolean };

// Constants -------------------------------------------------------------------

/** Worker threads don't inherit tsx's TypeScript loader, so each registers it before loading this script. */
const WORKER_BOOT = `import('tsx/esm/api').then(({ register }) => { register(); return import(${JSON.stringify(import.meta.url)}); });`;

// Recheck ---------------------------------------------------------------------

/** The table's mates, and the given level's draws for an unbounded table. */
function readCases(dir: string, drawLevel: string | undefined): Case[] {
	const lines = (file: string): string[] => fs.readFileSync(`${dir}/${file}`, 'utf8').split('\n').filter(Boolean); // prettier-ignore
	const mates = fs
		.readdirSync(dir)
		.filter((file) => /^mates-\d+\.tsv$/.test(file))
		.flatMap((file) => lines(file))
		.map((line): Case => {
			const [label, layout] = line.split('\t')[0]!.split(' @') as [
				string,
				string | undefined,
			];
			return { label, layout, isMate: true };
		});
	const draws = drawLevel === undefined ? [] : lines(`draws-${drawLevel}.txt`);
	return [...mates, ...draws.map((label): Case => ({ label, layout: undefined, isMate: false }))];
}

/** Searches the cases on worker threads, resolving with a description of each changed verdict. */
function recheck(cases: Case[], radius: string, threads: number): Promise<string[]> {
	const changed: string[] = [];
	let next = 0;
	let active = Math.min(threads, cases.length);
	return new Promise((resolve) => {
		if (active === 0) resolve(changed);
		for (let w = 0; w < Math.min(threads, cases.length); w++) {
			const worker = new Worker(WORKER_BOOT, {
				eval: true,
				env: { ...process.env, R: radius },
			});
			const feed = (): void => {
				if (next < cases.length) worker.postMessage(cases[next++]);
				else void worker.terminate();
			};
			worker.on('message', (change: string | undefined) => {
				if (change !== undefined) changed.push(change);
				feed();
			});
			worker.on('exit', () => {
				if (--active === 0) resolve(changed);
			});
			feed();
		}
	});
}

/** The case's change of verdict under the current search, or undefined when it holds. */
function changeOf({ label, layout, isMate }: Case): string | undefined {
	matesearch.setWalls(layout ?? '_,_,_,_');
	const [white, black] = matesearch.parse(label);
	if ((matesearch.isMatePossible(white, black) !== undefined) === isMate) return undefined;
	return `${isMate ? 'MATE NOW DRAWS' : 'DRAW NOW MATES'}\t${label}${layout ? ` @${layout}` : ''}`;
}

// Entry -----------------------------------------------------------------------

if (isMainThread) {
	const [boardKind, outDir, drawLevel] = process.argv.slice(2);
	if ((boardKind !== 'unbounded' && boardKind !== 'bounded') || outDir === undefined)
		throw Error('Usage: npx tsx scripts/insuffmat/recheck.ts <unbounded|bounded> <out dir> [draw level]'); // prettier-ignore
	const cases = readCases(
		`${outDir}/${boardKind}`,
		boardKind === 'unbounded' ? drawLevel : undefined,
	);
	const radius = boardKind === 'bounded' ? '7' : '6';
	const changed = await recheck(cases, radius, os.availableParallelism());
	for (const change of changed) console.log(change);
	console.log(`${cases.length} sets rechecked, ${changed.length} verdicts changed`);
	if (changed.length > 0) process.exitCode = 1;
} else {
	parentPort!.on('message', (c: Case) => parentPort!.postMessage(changeOf(c)));
}
