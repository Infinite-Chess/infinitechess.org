// src/client/scripts/esm/views/analysis/compression/enginecompression.int.test.ts

/**
 * Runs the Apeiron engine on random positions with far pieces, compressed and not, and checks it
 * sees the same legal moves in both, and that its lines beyond i64 lift to legal moves.
 */

import fs from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import gameformulator from '../../../../../../shared/chess/game/gameformulator.js';

import enginecompression from './enginecompression.js';

// Types -----------------------------------------------------------------------

/** The parts of the engine glue these tests drive. */
interface EngineModule {
	default: (init: { module_or_path: Buffer }) => Promise<unknown>;
	Engine: { from_icn: (icn: string, config: Record<string, never>) => Engine };
}

interface Engine {
	get_legal_moves_js: () => { from: string; to: string; promotion?: string | null }[];
	analyse: (
		options: Record<string, number>,
		onInfo: () => void,
	) => { lines: { moves: string[] }[] } | null;
	free: () => void;
}

type Piece = { abbr: string; x: bigint; y: bigint; rights?: boolean };

// Constants -------------------------------------------------------------------

const ENGINE_DIR = new URL('../../../../../pkg/apeiron/pkg/', import.meta.url);
const CAP = 2n ** 63n - 1001n;
const CAPPED_BORDER = `-${CAP},${CAP},-${CAP},${CAP}`;
/** Positions here stay inside i64 so the engine runs them as they are, and this forces their compression. */
const FORCED_LIMIT = 2n ** 40n;

const HOME_TYPES = 'Q q R r B b N n P p AM am CH ar GU ca'.split(' ');
const FAR_TYPES = 'Q q R r B b AM am CH ch AR ar N n P p'.split(' ');

// State -----------------------------------------------------------------------

let wasm: EngineModule;

// Position Generation ---------------------------------------------------------

/** A deterministic [0, 1) generator, so a failure always reproduces. */
function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}

/**
 * A home army around the origin plus far pieces, each aligned with a piece or scattered, at distances
 * up to `maxExponent` digits. `forks` adds three far pieces whose lines meet at one far empty square.
 */
function randomPosition(
	random: () => number,
	maxExponent: number,
	extraTypes: string[],
	forks: boolean,
): Piece[] {
	const int = (low: number, high: number): number =>
		low + Math.floor(random() * (high - low + 1));
	const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
	const far = (): bigint => BigInt(int(1, 9)) * 10n ** BigInt(int(11, maxExponent)) + BigInt(int(-20, 20)) * (random() < 0.5 ? -1n : 1n); // prettier-ignore
	const sign = (): bigint => (random() < 0.5 ? -1n : 1n);

	const pieces: Piece[] = [
		{ abbr: 'K', x: 5n, y: 1n, rights: true },
		{ abbr: 'k', x: BigInt(int(-6, 6)), y: BigInt(int(6, 9)) },
	];
	if (random() < 0.5) pieces.push({ abbr: 'R', x: far(), y: 1n, rights: true }); // A far castling partner.
	for (let i = int(2, 12); i > 0; i--) pieces.push({ abbr: pick([...HOME_TYPES, ...extraTypes]), x: BigInt(int(-8, 8)), y: BigInt(int(-8, 8)) }); // prettier-ignore
	for (let i = int(1, 5); i > 0; i--) {
		if (random() < 0.6) {
			const anchor = pick(pieces);
			const [dx, dy] = pick([[1n, 0n], [0n, 1n], [1n, 1n], [1n, -1n]] as const);
			const distance = far() * sign();
			const wiggle = random() < 0.5 ? 0n : BigInt(int(-3, 3));
			pieces.push({ abbr: pick([...FAR_TYPES, ...extraTypes]), x: anchor.x + distance * dx + (dy === 0n ? 0n : wiggle), y: anchor.y + distance * dy + (dy === 0n ? wiggle : 0n) }); // prettier-ignore
		} else pieces.push({ abbr: pick([...FAR_TYPES, ...extraTypes]), x: far() * sign(), y: far() * sign() }); // prettier-ignore
	}
	if (forks) {
		const [x, y, d1, d2] = [far() * sign(), far() * sign(), far(), far()];
		pieces.push({ abbr: 'Q', x, y: y + d1 }, { abbr: pick(['r', 'q']), x: x + d2, y }, { abbr: 'b', x: x - d1, y: y - d1 }); // prettier-ignore
	}
	const seen = new Set<string>();
	return pieces.filter((p) => !seen.has(`${p.x},${p.y}`) && seen.add(`${p.x},${p.y}`));
}

/** The rules section of a random ICN: turn, move rule, maybe promotion ranks and a real left border edge. */
function randomRules(random: () => number, border: boolean): string {
	const turn = random() < 0.5 ? 'w' : 'b';
	const promotion =
		random() < 0.5 ? ` (${8 + Math.floor(random() * 4)}|-${8 + Math.floor(random() * 4)})` : '';
	const left = border && random() < 0.4 ? `-${9 + Math.floor(random() * 4)}` : `-${CAP}`;
	return `${turn} 0/100 1${promotion} ${left},${CAP},-${CAP},${CAP}`;
}

/** The position section of an ICN. */
function positionText(pieces: Piece[]): string {
	return pieces.map((p) => `${p.abbr}${p.x},${p.y}${p.rights ? '+' : ''}`).join('|');
}

/** Appends up to `plies` engine-legal moves, so the position carries move history. */
function withHistory(icn: string, random: () => number, plies: number): string {
	const moves: string[] = [];
	for (let i = 0; i < plies; i++) {
		const position = wasm.Engine.from_icn(moves.length ? `${icn} ${moves.join('|')}` : icn, {});
		const legal = position.get_legal_moves_js();
		position.free();
		if (legal.length === 0) break;
		const move = legal[Math.floor(random() * legal.length)]!;
		moves.push(`${move.from}>${move.to}${move.promotion ? '=Q' : ''}`);
	}
	return moves.length ? `${icn} ${moves.join('|')}` : icn;
}

// Checks ----------------------------------------------------------------------

/** The engine's legal moves on `icn`, without promotion suffixes. */
function legalMoves(icn: string): Set<string> {
	const position = wasm.Engine.from_icn(icn, {});
	try {
		return new Set(position.get_legal_moves_js().map((move) => `${move.from}>${move.to}`));
	} finally {
		position.free();
	}
}

/**
 * Compresses `icn` as if the engine's coordinates ended at the forced limit, and checks the engine
 * generates exactly the same legal moves there as on the original, once mapped back.
 */
function expectSameLegalMoves(icn: string): void {
	const prepared = enginecompression.prepare(icn, FORCED_LIMIT);
	expect(prepared, icn).toBeDefined();
	const lifted = [...legalMoves(prepared!.icn)].map((token) => prepared!.liftLine([token])[0]);
	expect(
		lifted.filter((token) => token === undefined),
		icn,
	).toHaveLength(0);
	expect(new Set(lifted), icn).toEqual(legalMoves(icn));
}

// Tests -----------------------------------------------------------------------

beforeAll(async () => {
	Object.assign(globalThis, { name: 'main' }); // wasm-bindgen-rayon's worker helper reads the worker global `name` on import
	wasm = (await import(new URL('apeiron.js', ENGINE_DIR).href)) as EngineModule;
	await wasm.default({ module_or_path: fs.readFileSync(new URL('apeiron_bg.wasm', ENGINE_DIR)) });
});

describe('enginecompression', () => {
	it('passes a position within the engine coordinates through untouched', () => {
		const icn = `w ${CAPPED_BORDER} K0,0|k5,5|Q900000000000000000,3`;
		expect(enginecompression.prepare(icn, CAP)?.icn).toBe(icn);
	});

	it('refuses a Huygen position that has to be compressed', () => {
		const far = 10n ** 30n;
		for (const pieces of [
			`K0,0|k5,5|HU3,0|q${far},7`,
			`K${far},${far}|k${far + 5n},${far + 5n}|HU${far + 3n},${far}`,
		]) {
			expect(
				enginecompression.prepare(`w ${CAPPED_BORDER} ${pieces}`, CAP),
				pieces,
			).toBeUndefined();
		}
	});

	it('keeps the engine legal moves identical on positions with far pieces', () => {
		const random = seeded(7);
		for (let run = 0; run < 150; run++) {
			const icn = `${randomRules(random, true)} ${positionText(randomPosition(random, 15, [], run % 3 === 2))}`;
			expectSameLegalMoves(
				random() < 0.5 ? withHistory(icn, random, 1 + Math.floor(random() * 30)) : icn,
			);
		}
	}, 300_000);

	it('keeps the engine legal moves identical with knightriders', () => {
		const random = seeded(11);
		for (let run = 0; run < 60; run++) {
			const icn = `${randomRules(random, true)} ${positionText(randomPosition(random, 15, ['NR', 'nr'], run % 3 === 2))}`;
			expectSameLegalMoves(icn);
		}
	}, 300_000);

	it('keeps the engine legal moves identical with the army far from the origin', () => {
		const random = seeded(31);
		for (let run = 0; run < 40; run++) {
			const shift =
				BigInt(1 + Math.floor(random() * 9)) * 10n ** 13n * (random() < 0.5 ? -1n : 1n);
			const pieces = randomPosition(random, 15, [], false).map((p) => ({ ...p, x: p.x + shift, y: p.y - shift })); // prettier-ignore
			const icn = `${randomRules(random, false)} ${positionText(pieces)}`;
			expectSameLegalMoves(withHistory(icn, random, 10 + Math.floor(random() * 20)));
		}
	}, 300_000);

	it('lifts every engine line on a position beyond i64 to moves legal on the original', async () => {
		const random = seeded(21);
		for (let run = 0; run < 15; run++) {
			const [rules, pieces] = [`${random() < 0.5 ? 'w' : 'b'} 0/100 1 (8|1)`, positionText(randomPosition(random, 60, [], false))]; // prettier-ignore
			const prepared = enginecompression.prepare(`${rules} ${CAPPED_BORDER} ${pieces}`, CAP);
			expect(prepared).toBeDefined();
			const search = wasm.Engine.from_icn(prepared!.icn, {});
			const summary = search.analyse(
				{ multi_pv: 3, max_depth: 4, start_depth: 1, slice_ms: 0 },
				() => {},
			);
			search.free();
			for (const line of summary?.lines ?? []) {
				const lifted = prepared!.liftLine(line.moves);
				expect(lifted).toHaveLength(line.moves.length);
				if (lifted.length === 0) continue;
				// The original has no border: the clamped one exists only for the engine.
				const replay = icnconverter.ShortToLong_Format(
					`${rules} ${pieces} ${lifted.join('|')}`,
				);
				await expect(
					gameformulator.formulateGame(replay, undefined, true),
				).resolves.toBeDefined();
			}
		}
	}, 300_000);
});
